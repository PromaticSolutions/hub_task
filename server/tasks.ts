import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  PRIORITIES,
  STATUSES,
  extractMentions,
  type HistoryEntry,
  type HistoryType,
  type Task,
  type TaskInput,
  type TaskPatch,
} from '../shared/types';
import { UPLOAD_DIR, commit, db, removeStoredFile } from './db';
import { HttpError, actorId, notFound, parse, send } from './http';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor inválida');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida');

const taskFields = {
  title: z.string().trim().min(1, 'informe um título').max(200),
  description: z.string().max(20000).optional(),
  clientId: z.string().nullable().optional(),
  color: hex.nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  participantIds: z.array(z.string()).max(50).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(STATUSES).optional(),
  order: z.number().finite().optional(),
  scope: z.enum(['team', 'personal']).optional(),
  ownerId: z.string().nullable().optional(),
  onboarding: z.boolean().optional(),
  dueDate: day.nullable().optional(),
};

const taskInputSchema = z.object(taskFields);
const taskPatchSchema = z.object(taskFields).partial().extend({ archived: z.boolean().optional() });
const commentSchema = z.object({ body: z.string().trim().min(1, 'escreva um comentário').max(5000) });
const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('status'), status: z.enum(STATUSES) }),
    z.object({ type: z.literal('assignee'), assigneeId: z.string().nullable() }),
    z.object({ type: z.literal('archive'), archived: z.boolean() }),
    z.object({ type: z.literal('delete') }),
  ]),
});

const now = () => new Date().toISOString();

export function findTask(id: string): Task {
  const task = db.tasks.find((t) => t.id === id);
  if (!task) throw notFound('Tarefa');
  return task;
}

function ensureMember(id: string | null | undefined, label: string) {
  if (id && !db.members.some((m) => m.id === id)) throw new HttpError(400, `${label} não encontrado(a).`);
}

function ensureClient(id: string | null | undefined) {
  if (id && !db.clients.some((c) => c.id === id)) throw new HttpError(400, 'Cliente não encontrado.');
}

function ensureParticipants(ids: string[] | undefined) {
  ids?.forEach((id) => ensureMember(id, 'Participante'));
}

function cleanParticipants(ids: string[], assigneeId: string | null) {
  return [...new Set(ids)].filter((id) => id !== assigneeId && db.members.some((m) => m.id === id));
}

export function addHistory(task: Task, type: HistoryType, actor: string | null, from: string | null, to: string | null) {
  const entry: HistoryEntry = { id: randomUUID(), type, at: now(), actorId: actor, from, to };
  task.history.push(entry);
}

function topOrder(status: Task['status']) {
  const orders = db.tasks.filter((t) => t.status === status).map((t) => t.order);
  return orders.length ? Math.min(...orders) - 1 : 0;
}

/** Re-spaces orders inside a column when fractional positions get too close. Returns true if anything changed. */
function rebalance(status: Task['status']): boolean {
  const column = db.tasks.filter((t) => t.status === status).sort((a, b) => a.order - b.order);
  const tooClose = column.some((t, i) => i > 0 && t.order - column[i - 1].order < 1e-6);
  if (!tooClose) return false;
  column.forEach((t, i) => (t.order = i));
  return true;
}

export function createTask(input: TaskInput, actor: string | null): Task {
  ensureClient(input.clientId);
  ensureMember(input.assigneeId, 'Responsável');
  ensureParticipants(input.participantIds);
  const scope = input.scope ?? 'team';
  const ownerId = scope === 'personal' ? input.ownerId ?? actor : null;
  if (scope === 'personal' && !ownerId) {
    throw new HttpError(400, 'Para criar tarefas pessoais, selecione quem você é em Configurações.');
  }
  ensureMember(ownerId, 'Dono');
  const assigneeId = input.assigneeId ?? null;
  const status = input.status ?? 'todo';
  const description = input.description ?? '';
  const timestamp = now();
  db.taskCounter += 1;
  const task: Task = {
    id: randomUUID(),
    number: db.taskCounter,
    title: input.title.trim(),
    description,
    descriptionMentions: extractMentions(description, db.members),
    clientId: input.clientId ?? null,
    color: input.color ?? null,
    assigneeId,
    participantIds: cleanParticipants(input.participantIds ?? [], assigneeId),
    priority: input.priority ?? 'medium',
    status,
    order: input.order ?? topOrder(status),
    scope,
    ownerId,
    onboarding: input.onboarding ?? false,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: actor,
    dueDate: input.dueDate ?? null,
    completedAt: status === 'done' ? timestamp : null,
    archived: false,
    archivedAt: null,
    attachments: [],
    comments: [],
    history: [],
  };
  addHistory(task, 'created', actor, null, status);
  db.tasks.push(task);
  return task;
}

/** Applies a patch, recording history for status, assignee, participants, due date and archiving. */
function applyPatch(task: Task, patch: TaskPatch, actor: string | null) {
  // Validate everything first so a rejected request never leaves partial changes in memory.
  if (patch.clientId !== undefined) ensureClient(patch.clientId);
  if (patch.assigneeId !== undefined) ensureMember(patch.assigneeId, 'Responsável');
  ensureParticipants(patch.participantIds);
  let personalOwner: string | null = null;
  if (patch.scope === 'personal' && task.scope !== 'personal') {
    personalOwner = patch.ownerId ?? task.ownerId ?? actor;
    if (!personalOwner) throw new HttpError(400, 'Selecione quem você é em Configurações para tornar a tarefa pessoal.');
    ensureMember(personalOwner, 'Dono');
  }
  const timestamp = now();

  if (patch.title !== undefined) task.title = patch.title.trim();
  if (patch.description !== undefined) {
    task.description = patch.description;
    task.descriptionMentions = extractMentions(patch.description, db.members);
  }
  if (patch.clientId !== undefined) task.clientId = patch.clientId;
  if (patch.color !== undefined) task.color = patch.color;
  if (patch.priority !== undefined) task.priority = patch.priority;
  if (patch.onboarding !== undefined) task.onboarding = patch.onboarding;
  if (patch.order !== undefined) task.order = patch.order;

  if (patch.scope !== undefined && patch.scope !== task.scope) {
    task.ownerId = patch.scope === 'personal' ? personalOwner : null;
    task.scope = patch.scope;
  }

  if (patch.status !== undefined && patch.status !== task.status) {
    addHistory(task, 'status', actor, task.status, patch.status);
    task.status = patch.status;
    task.completedAt = patch.status === 'done' ? timestamp : null;
    if (patch.order === undefined) task.order = topOrder(patch.status);
  }

  if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
    addHistory(task, 'assignee', actor, task.assigneeId, patch.assigneeId);
    task.assigneeId = patch.assigneeId;
  }

  const nextParticipants =
    patch.participantIds !== undefined || patch.assigneeId !== undefined
      ? cleanParticipants(patch.participantIds ?? task.participantIds, task.assigneeId)
      : task.participantIds;
  const before = [...task.participantIds].sort().join(',');
  const after = [...nextParticipants].sort().join(',');
  if (before !== after) {
    addHistory(task, 'participants', actor, task.participantIds.join(','), nextParticipants.join(','));
    task.participantIds = nextParticipants;
  }

  if (patch.dueDate !== undefined && patch.dueDate !== task.dueDate) {
    addHistory(task, 'dueDate', actor, task.dueDate, patch.dueDate);
    task.dueDate = patch.dueDate;
  }

  if (patch.archived !== undefined && patch.archived !== task.archived) {
    addHistory(task, patch.archived ? 'archived' : 'restored', actor, null, null);
    task.archived = patch.archived;
    task.archivedAt = patch.archived ? timestamp : null;
  }

  task.updatedAt = timestamp;
}

export function deleteTaskById(id: string) {
  const idx = db.tasks.findIndex((t) => t.id === id);
  if (idx === -1) throw notFound('Tarefa');
  const [task] = db.tasks.splice(idx, 1);
  task.attachments.forEach((a) => removeStoredFile(a.storedName));
}

function copyAttachment(storedName: string): string {
  const ext = path.extname(storedName);
  const copy = `${randomUUID()}${ext}`;
  fs.copyFileSync(path.join(UPLOAD_DIR, path.basename(storedName)), path.join(UPLOAD_DIR, copy));
  return copy;
}

// defParamCharset keeps accented file names intact (supported by multer 2, missing from its typings).
const uploadOptions: multer.Options & { defParamCharset: string } = {
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  defParamCharset: 'utf8',
};
const upload = multer(uploadOptions);

/** Images that are safe to render inline; everything else (including SVG/HTML) is forced to download. */
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

export const tasksRouter = Router();

tasksRouter.post('/tasks', (req, res) => {
  const input = parse(taskInputSchema, req.body);
  const task = createTask(input, actorId(req));
  commit();
  send(res, task, 201);
});

tasksRouter.patch('/tasks/:id', (req, res) => {
  const patch = parse(taskPatchSchema, req.body);
  const task = findTask(req.params.id);
  applyPatch(task, patch, actorId(req));
  const rebalanced = patch.order !== undefined && rebalance(task.status);
  commit(rebalanced ? 2 : 1);
  send(res, task);
});

tasksRouter.post('/tasks/:id/duplicate', (req, res) => {
  const source = findTask(req.params.id);
  const actor = actorId(req);
  const copy = createTask(
    {
      title: `${source.title} (cópia)`,
      description: source.description,
      clientId: source.clientId,
      color: source.color,
      assigneeId: source.assigneeId,
      participantIds: source.participantIds,
      priority: source.priority,
      status: source.status,
      order: source.order + 0.0001,
      scope: source.scope,
      ownerId: source.ownerId,
      onboarding: source.onboarding,
      dueDate: source.dueDate,
    },
    actor,
  );
  copy.history = [];
  addHistory(copy, 'duplicated', actor, String(source.number), null);
  copy.attachments = source.attachments.flatMap((a) => {
    try {
      return [{ ...a, id: randomUUID(), storedName: copyAttachment(a.storedName) }];
    } catch {
      return [];
    }
  });
  const rebalanced = rebalance(copy.status);
  commit(rebalanced ? 2 : 1);
  send(res, copy, 201);
});

tasksRouter.delete('/tasks/:id', (req, res) => {
  deleteTaskById(req.params.id);
  commit();
  send(res, { ok: true });
});

tasksRouter.post('/tasks/bulk', (req, res) => {
  const { ids, action } = parse(bulkSchema, req.body);
  const actor = actorId(req);
  const tasks = ids.map(findTask);
  if (action.type === 'delete') {
    tasks.forEach((t) => deleteTaskById(t.id));
  } else {
    for (const task of tasks) {
      if (action.type === 'status') applyPatch(task, { status: action.status }, actor);
      if (action.type === 'assignee') applyPatch(task, { assigneeId: action.assigneeId }, actor);
      if (action.type === 'archive') applyPatch(task, { archived: action.archived }, actor);
    }
  }
  commit();
  send(res, { tasks: action.type === 'delete' ? [] : tasks });
});

tasksRouter.post('/tasks/:id/comments', (req, res) => {
  const { body } = parse(commentSchema, req.body);
  const task = findTask(req.params.id);
  task.comments.push({
    id: randomUUID(),
    authorId: actorId(req),
    body,
    mentions: extractMentions(body, db.members),
    createdAt: now(),
  });
  task.updatedAt = now();
  commit();
  send(res, task, 201);
});

tasksRouter.delete('/tasks/:id/comments/:commentId', (req, res) => {
  const task = findTask(req.params.id);
  const before = task.comments.length;
  task.comments = task.comments.filter((c) => c.id !== req.params.commentId);
  if (task.comments.length === before) throw notFound('Comentário');
  task.updatedAt = now();
  commit();
  send(res, task);
});

tasksRouter.post('/tasks/:id/attachments', (req, res, next) => {
  findTask(req.params.id);
  upload.array('files', 10)(req, res, (err?: unknown) => {
    if (err) return next(err);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    let task: Task;
    try {
      task = findTask(req.params.id);
    } catch (e) {
      files.forEach((f) => removeStoredFile(f.filename));
      return next(e);
    }
    if (!files.length) return next(new HttpError(400, 'Nenhum arquivo enviado.'));
    const actor = actorId(req);
    for (const f of files) {
      task.attachments.push({
        id: randomUUID(),
        name: f.originalname.slice(0, 255),
        size: f.size,
        mimeType: f.mimetype || 'application/octet-stream',
        storedName: f.filename,
        uploadedAt: now(),
        uploadedBy: actor,
      });
    }
    task.updatedAt = now();
    commit();
    send(res, task, 201);
  });
});

tasksRouter.delete('/tasks/:id/attachments/:attachmentId', (req, res) => {
  const task = findTask(req.params.id);
  const attachment = task.attachments.find((a) => a.id === req.params.attachmentId);
  if (!attachment) throw notFound('Anexo');
  task.attachments = task.attachments.filter((a) => a.id !== attachment.id);
  removeStoredFile(attachment.storedName);
  task.updatedAt = now();
  commit();
  send(res, task);
});

tasksRouter.get('/tasks/:id/attachments/:attachmentId', (req, res) => {
  const task = findTask(req.params.id);
  const attachment = task.attachments.find((a) => a.id === req.params.attachmentId);
  if (!attachment) throw notFound('Anexo');
  const file = path.join(UPLOAD_DIR, path.basename(attachment.storedName));
  if (!fs.existsSync(file)) throw new HttpError(410, 'O arquivo deste anexo não está mais disponível.');
  const inline = INLINE_TYPES.has(attachment.mimeType) && req.query.download === undefined;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  res.setHeader('Content-Type', inline ? attachment.mimeType : 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
  );
  res.sendFile(file);
});
