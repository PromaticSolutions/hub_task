import { randomUUID } from 'node:crypto';
import { extractMentions, type HistoryEntry, type HistoryType, type Task, type TaskInput, type TaskPatch } from '../shared/types.js';
import { HttpError, notFound } from './http.js';
import type { DbShape } from './store.js';

export const now = () => new Date().toISOString();

export function findTask(db: DbShape, id: string): Task {
  const task = db.tasks.find((t) => t.id === id);
  if (!task) throw notFound('Tarefa');
  return task;
}

export function ensureMember(db: DbShape, id: string | null | undefined, label: string) {
  if (id && !db.members.some((m) => m.id === id)) throw new HttpError(400, `${label} não encontrado(a).`);
}

function ensureClient(db: DbShape, id: string | null | undefined) {
  if (id && !db.clients.some((c) => c.id === id)) throw new HttpError(400, 'Cliente não encontrado.');
}

function ensureParticipants(db: DbShape, ids: string[] | undefined) {
  ids?.forEach((id) => ensureMember(db, id, 'Participante'));
}

function cleanParticipants(db: DbShape, ids: string[], assigneeId: string | null) {
  return [...new Set(ids)].filter((id) => id !== assigneeId && db.members.some((m) => m.id === id));
}

export function addHistory(task: Task, type: HistoryType, actor: string | null, from: string | null, to: string | null) {
  const entry: HistoryEntry = { id: randomUUID(), type, at: now(), actorId: actor, from, to };
  task.history.push(entry);
}

function topOrder(db: DbShape, status: Task['status']) {
  const orders = db.tasks.filter((t) => t.status === status).map((t) => t.order);
  return orders.length ? Math.min(...orders) - 1 : 0;
}

/** Re-spaces orders inside a column when fractional positions get too close. Returns true if anything changed. */
export function rebalance(db: DbShape, status: Task['status']): boolean {
  const column = db.tasks.filter((t) => t.status === status).sort((a, b) => a.order - b.order);
  const tooClose = column.some((t, i) => i > 0 && t.order - column[i - 1].order < 1e-6);
  if (!tooClose) return false;
  column.forEach((t, i) => (t.order = i));
  return true;
}

export function createTask(db: DbShape, input: TaskInput, actor: string | null): Task {
  ensureClient(db, input.clientId);
  ensureMember(db, input.assigneeId, 'Responsável');
  ensureParticipants(db, input.participantIds);
  const scope = input.scope ?? 'team';
  const ownerId = scope === 'personal' ? input.ownerId ?? actor : null;
  if (scope === 'personal' && !ownerId) {
    throw new HttpError(400, 'Para criar tarefas pessoais, selecione quem você é em Configurações.');
  }
  ensureMember(db, ownerId, 'Dono');
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
    participantIds: cleanParticipants(db, input.participantIds ?? [], assigneeId),
    priority: input.priority ?? 'medium',
    status,
    order: input.order ?? topOrder(db, status),
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
export function applyPatch(db: DbShape, task: Task, patch: TaskPatch, actor: string | null) {
  // Validate everything first so a rejected request never leaves partial changes behind.
  if (patch.clientId !== undefined) ensureClient(db, patch.clientId);
  if (patch.assigneeId !== undefined) ensureMember(db, patch.assigneeId, 'Responsável');
  ensureParticipants(db, patch.participantIds);
  let personalOwner: string | null = null;
  if (patch.scope === 'personal' && task.scope !== 'personal') {
    personalOwner = patch.ownerId ?? task.ownerId ?? actor;
    if (!personalOwner) throw new HttpError(400, 'Selecione quem você é em Configurações para tornar a tarefa pessoal.');
    ensureMember(db, personalOwner, 'Dono');
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
    if (patch.order === undefined) task.order = topOrder(db, patch.status);
  }

  if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
    addHistory(task, 'assignee', actor, task.assigneeId, patch.assigneeId);
    task.assigneeId = patch.assigneeId;
  }

  const nextParticipants =
    patch.participantIds !== undefined || patch.assigneeId !== undefined
      ? cleanParticipants(db, patch.participantIds ?? task.participantIds, task.assigneeId)
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

/** Removes a task and returns it, so the caller can delete its files after the commit. */
export function deleteTaskById(db: DbShape, id: string): Task {
  const idx = db.tasks.findIndex((t) => t.id === id);
  if (idx === -1) throw notFound('Tarefa');
  const [task] = db.tasks.splice(idx, 1);
  return task;
}
