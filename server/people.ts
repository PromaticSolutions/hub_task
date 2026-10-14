import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { PRIORITIES, type Client, type Member } from '../shared/types';
import { commit, db } from './db';
import { HttpError, actorId, notFound, parse, send } from './http';
import { addHistory, createTask } from './tasks';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor inválida');
const optionalText = (max: number) => z.string().trim().max(max).optional().default('');

const memberSchema = z.object({
  name: z.string().trim().min(1, 'informe o nome').max(80),
  email: z.union([z.literal(''), z.string().trim().email('e-mail inválido')]).optional().default(''),
  role: optionalText(80),
  color: hex,
});

const clientSchema = z.object({
  name: z.string().trim().min(1, 'informe o nome').max(100),
  color: hex,
  contactName: optionalText(100),
  email: z.union([z.literal(''), z.string().trim().email('e-mail inválido')]).optional().default(''),
  phone: optionalText(40),
  notes: optionalText(2000),
});

const settingsSchema = z.object({
  onboardingTemplate: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().trim().min(1, 'cada etapa precisa de um título').max(200),
        description: z.string().max(2000).default(''),
        offsetDays: z.number().int().min(0).max(365),
        priority: z.enum(PRIORITIES),
      }),
    )
    .max(50),
});

const onboardingSchema = z.object({
  assigneeId: z.string().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida'),
  stepIds: z.array(z.string()).min(1, 'selecione ao menos uma etapa'),
});

const now = () => new Date().toISOString();

function nameTaken(list: { id: string; name: string }[], name: string, exceptId?: string) {
  const n = name.trim().toLocaleLowerCase('pt-BR');
  return list.some((x) => x.id !== exceptId && x.name.trim().toLocaleLowerCase('pt-BR') === n);
}

function addDays(isoDay: string, days: number) {
  const [y, m, d] = isoDay.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export const peopleRouter = Router();

// ---------- Members ----------
peopleRouter.post('/members', (req, res) => {
  const input = parse(memberSchema, req.body);
  if (nameTaken(db.members, input.name)) throw new HttpError(409, 'Já existe um membro com esse nome.');
  const member: Member = { id: randomUUID(), ...input, createdAt: now() };
  db.members.push(member);
  commit();
  send(res, member, 201);
});

peopleRouter.patch('/members/:id', (req, res) => {
  const member = db.members.find((m) => m.id === req.params.id);
  if (!member) throw notFound('Membro');
  const input = parse(memberSchema, req.body);
  if (nameTaken(db.members, input.name, member.id)) throw new HttpError(409, 'Já existe um membro com esse nome.');
  Object.assign(member, input);
  commit();
  send(res, member);
});

peopleRouter.delete('/members/:id', (req, res) => {
  const idx = db.members.findIndex((m) => m.id === req.params.id);
  if (idx === -1) throw notFound('Membro');
  const [member] = db.members.splice(idx, 1);
  const actor = actorId(req);
  for (const task of db.tasks) {
    if (task.assigneeId === member.id) {
      addHistory(task, 'assignee', actor, member.id, null);
      task.assigneeId = null;
      task.updatedAt = now();
    }
    if (task.participantIds.includes(member.id)) {
      const next = task.participantIds.filter((id) => id !== member.id);
      addHistory(task, 'participants', actor, task.participantIds.join(','), next.join(','));
      task.participantIds = next;
      task.updatedAt = now();
    }
    // Personal tasks are kept as team tasks so no work is lost.
    if (task.scope === 'personal' && task.ownerId === member.id) {
      task.scope = 'team';
      task.ownerId = null;
      task.updatedAt = now();
    }
  }
  commit();
  send(res, { ok: true });
});

// ---------- Clients ----------
peopleRouter.post('/clients', (req, res) => {
  const input = parse(clientSchema, req.body);
  if (nameTaken(db.clients, input.name)) throw new HttpError(409, 'Já existe um cliente com esse nome.');
  const client: Client = { id: randomUUID(), ...input, createdAt: now() };
  db.clients.push(client);
  commit();
  send(res, client, 201);
});

peopleRouter.patch('/clients/:id', (req, res) => {
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) throw notFound('Cliente');
  const input = parse(clientSchema, req.body);
  if (nameTaken(db.clients, input.name, client.id)) throw new HttpError(409, 'Já existe um cliente com esse nome.');
  Object.assign(client, input);
  commit();
  send(res, client);
});

peopleRouter.delete('/clients/:id', (req, res) => {
  const idx = db.clients.findIndex((c) => c.id === req.params.id);
  if (idx === -1) throw notFound('Cliente');
  const [client] = db.clients.splice(idx, 1);
  for (const task of db.tasks) {
    if (task.clientId === client.id) {
      task.clientId = null;
      task.color = task.color ?? client.color;
      task.updatedAt = now();
    }
  }
  commit();
  send(res, { ok: true });
});

peopleRouter.post('/clients/:id/onboarding', (req, res) => {
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) throw notFound('Cliente');
  const input = parse(onboardingSchema, req.body);
  const steps = db.settings.onboardingTemplate.filter((s) => input.stepIds.includes(s.id));
  if (!steps.length) throw new HttpError(400, 'Nenhuma etapa válida selecionada.');
  if (input.assigneeId && !db.members.some((m) => m.id === input.assigneeId)) {
    throw new HttpError(400, 'Responsável não encontrado(a).');
  }
  const actor = actorId(req);
  // Steps are created bottom-up so the first step ends up at the top of "A Fazer".
  const created = [...steps].reverse().map((step) =>
    createTask(
      {
        title: step.title,
        description: step.description,
        clientId: client.id,
        assigneeId: input.assigneeId,
        priority: step.priority,
        status: 'todo',
        onboarding: true,
        dueDate: addDays(input.startDate, step.offsetDays),
      },
      actor,
    ),
  );
  commit();
  send(res, { tasks: created.reverse() }, 201);
});

// ---------- Settings ----------
peopleRouter.put('/settings', (req, res) => {
  const input = parse(settingsSchema, req.body);
  db.settings = { ...db.settings, ...input };
  commit();
  send(res, db.settings);
});
