import { randomUUID } from 'node:crypto';
import express, { Router } from 'express';
import { z } from 'zod';
import { PRIORITIES, STATUSES, extractMentions } from '../shared/types.js';
import { addHistory, applyPatch, createTask, deleteTaskById, findTask, now, rebalance } from './domain.js';
import { MAX_FILE_SIZE, STORED_NAME, acceptLocalUpload, getFileStorage, newStoredName } from './files.js';
import { HttpError, actorId, ah, notFound, parse, send } from './http.js';
import { mutate, readState } from './store.js';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor inválida');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida');

const taskFields = {
  title: z.string().trim().min(1, 'informe um título').max(200),
  description: z.string().max(20000).optional(),
  clientId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
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
    z.object({ type: z.literal('project'), projectId: z.string().nullable() }),
    z.object({ type: z.literal('archive'), archived: z.boolean() }),
    z.object({ type: z.literal('delete') }),
  ]),
});
const fileMetaSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().min(0).max(MAX_FILE_SIZE, 'arquivo maior que 25 MB'),
  mimeType: z.string().max(200).default('application/octet-stream'),
});
const registerSchema = fileMetaSchema.extend({ storedName: z.string().regex(STORED_NAME, 'arquivo inválido') });

export const tasksRouter = Router();

tasksRouter.post(
  '/tasks',
  ah(async (req, res) => {
    const input = parse(taskInputSchema, req.body);
    const { value, version } = await mutate((db) => createTask(db, input, actorId(req, db.members)));
    send(res, value, version, 201);
  }),
);

tasksRouter.patch(
  '/tasks/:id',
  ah(async (req, res) => {
    const patch = parse(taskPatchSchema, req.body);
    const { value, version } = await mutate((db, ctx) => {
      const task = findTask(db, req.params.id);
      applyPatch(db, task, patch, actorId(req, db.members));
      if (patch.order !== undefined && rebalance(db, task.status)) ctx.bump();
      return task;
    });
    send(res, value, version);
  }),
);

tasksRouter.post(
  '/tasks/:id/duplicate',
  ah(async (req, res) => {
    const storage = getFileStorage();
    const { db: current } = await readState();
    const source = findTask(current, req.params.id);
    // Copy files first; the new task only references copies that actually exist.
    const copies = new Map<string, string>();
    for (const a of source.attachments) {
      const target = newStoredName(a.name);
      try {
        await storage.copy(a.storedName, target);
        copies.set(a.id, target);
      } catch (err) {
        console.error('Falha ao copiar anexo:', err);
      }
    }
    try {
      const { value, version } = await mutate((db, ctx) => {
        const src = findTask(db, req.params.id);
        const actor = actorId(req, db.members);
        const copy = createTask(
          db,
          {
            title: `${src.title} (cópia)`,
            description: src.description,
            clientId: src.clientId,
            projectId: src.projectId,
            color: src.color,
            assigneeId: src.assigneeId,
            participantIds: src.participantIds,
            priority: src.priority,
            status: src.status,
            order: src.order + 0.0001,
            scope: src.scope,
            ownerId: src.ownerId,
            onboarding: src.onboarding,
            dueDate: src.dueDate,
          },
          actor,
        );
        copy.history = [];
        addHistory(copy, 'duplicated', actor, String(src.number), null);
        copy.attachments = src.attachments.flatMap((a) => {
          const storedName = copies.get(a.id);
          return storedName ? [{ ...a, id: randomUUID(), storedName }] : [];
        });
        if (rebalance(db, copy.status)) ctx.bump();
        return copy;
      });
      send(res, value, version, 201);
    } catch (err) {
      await storage.remove([...copies.values()]).catch(() => undefined);
      throw err;
    }
  }),
);

tasksRouter.delete(
  '/tasks/:id',
  ah(async (req, res) => {
    const { version } = await mutate((db, ctx) => {
      const task = deleteTaskById(db, req.params.id);
      const files = task.attachments.map((a) => a.storedName);
      if (files.length) ctx.afterCommit(() => getFileStorage().remove(files));
    });
    send(res, { ok: true }, version);
  }),
);

tasksRouter.post(
  '/tasks/bulk',
  ah(async (req, res) => {
    const { ids, action } = parse(bulkSchema, req.body);
    const { value, version } = await mutate((db, ctx) => {
      const actor = actorId(req, db.members);
      const tasks = ids.map((id) => findTask(db, id));
      if (action.type === 'delete') {
        const files = tasks.flatMap((t) => deleteTaskById(db, t.id).attachments.map((a) => a.storedName));
        if (files.length) ctx.afterCommit(() => getFileStorage().remove(files));
        return [];
      }
      for (const task of tasks) {
        if (action.type === 'status') applyPatch(db, task, { status: action.status }, actor);
        if (action.type === 'assignee') applyPatch(db, task, { assigneeId: action.assigneeId }, actor);
        if (action.type === 'project') applyPatch(db, task, { projectId: action.projectId }, actor);
        if (action.type === 'archive') applyPatch(db, task, { archived: action.archived }, actor);
      }
      return tasks;
    });
    send(res, { tasks: value }, version);
  }),
);

tasksRouter.post(
  '/tasks/:id/comments',
  ah(async (req, res) => {
    const { body } = parse(commentSchema, req.body);
    const { value, version } = await mutate((db) => {
      const task = findTask(db, req.params.id);
      task.comments.push({
        id: randomUUID(),
        authorId: actorId(req, db.members),
        body,
        mentions: extractMentions(body, db.members),
        createdAt: now(),
      });
      task.updatedAt = now();
      return task;
    });
    send(res, value, version, 201);
  }),
);

tasksRouter.delete(
  '/tasks/:id/comments/:commentId',
  ah(async (req, res) => {
    const { value, version } = await mutate((db) => {
      const task = findTask(db, req.params.id);
      const before = task.comments.length;
      task.comments = task.comments.filter((c) => c.id !== req.params.commentId);
      if (task.comments.length === before) throw notFound('Comentário');
      task.updatedAt = now();
      return task;
    });
    send(res, value, version);
  }),
);

/* ---------- Attachments: sign -> browser uploads the bytes -> register ---------- */

tasksRouter.post(
  '/tasks/:id/attachments/sign',
  ah(async (req, res) => {
    const meta = parse(fileMetaSchema, req.body);
    const { db, version } = await readState();
    findTask(db, req.params.id);
    const storedName = newStoredName(meta.name);
    const upload = await getFileStorage().signUpload(storedName);
    send(res, { storedName, uploadUrl: upload.url, headers: upload.headers }, version);
  }),
);

tasksRouter.post(
  '/tasks/:id/attachments',
  ah(async (req, res) => {
    const meta = parse(registerSchema, req.body);
    if (!(await getFileStorage().exists(meta.storedName))) {
      throw new HttpError(400, 'O arquivo não foi recebido. Tente enviar novamente.');
    }
    const { value, version } = await mutate((db) => {
      const task = findTask(db, req.params.id);
      if (db.tasks.some((t) => t.attachments.some((a) => a.storedName === meta.storedName))) {
        throw new HttpError(409, 'Este arquivo já foi anexado.');
      }
      task.attachments.push({
        id: randomUUID(),
        name: meta.name,
        size: meta.size,
        mimeType: meta.mimeType || 'application/octet-stream',
        storedName: meta.storedName,
        uploadedAt: now(),
        uploadedBy: actorId(req, db.members),
      });
      task.updatedAt = now();
      return task;
    });
    send(res, value, version, 201);
  }),
);

tasksRouter.delete(
  '/tasks/:id/attachments/:attachmentId',
  ah(async (req, res) => {
    const { value, version } = await mutate((db, ctx) => {
      const task = findTask(db, req.params.id);
      const attachment = task.attachments.find((a) => a.id === req.params.attachmentId);
      if (!attachment) throw notFound('Anexo');
      task.attachments = task.attachments.filter((a) => a.id !== attachment.id);
      task.updatedAt = now();
      ctx.afterCommit(() => getFileStorage().remove([attachment.storedName]));
      return task;
    });
    send(res, value, version);
  }),
);

tasksRouter.get(
  '/tasks/:id/attachments/:attachmentId',
  ah(async (req, res) => {
    const { db } = await readState();
    const task = findTask(db, req.params.id);
    const attachment = task.attachments.find((a) => a.id === req.params.attachmentId);
    if (!attachment) throw notFound('Anexo');
    await getFileStorage().sendDownload(res, attachment, req.query.download !== undefined);
  }),
);

/** Receives file bytes for local development (in production the browser uploads straight to Supabase). */
tasksRouter.put('/uploads/:storedName', express.raw({ type: () => true, limit: MAX_FILE_SIZE }), (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!acceptLocalUpload(req.params.storedName, token, body)) {
    res.status(403).json({ error: 'Link de envio inválido ou expirado.' });
    return;
  }
  res.status(201).json({ ok: true });
});
