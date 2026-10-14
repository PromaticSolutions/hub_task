import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { PRIORITIES, PROJECT_STATUSES, type Client, type Member, type Project } from '../shared/types.js';
import { addHistory, createTask, ensureClient } from './domain.js';
import { HttpError, actorId, ah, notFound, parse, send } from './http.js';
import { mutate } from './store.js';

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

const projectSchema = z.object({
  name: z.string().trim().min(1, 'informe o nome').max(100),
  color: hex,
  description: optionalText(2000),
  clientId: z.string().nullable().optional().default(null),
  status: z.enum(PROJECT_STATUSES).optional().default('active'),
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
peopleRouter.post(
  '/members',
  ah(async (req, res) => {
    const input = parse(memberSchema, req.body);
    const { value, version } = await mutate((db) => {
      if (nameTaken(db.members, input.name)) throw new HttpError(409, 'Já existe um membro com esse nome.');
      const member: Member = { id: randomUUID(), ...input, createdAt: now() };
      db.members.push(member);
      return member;
    });
    send(res, value, version, 201);
  }),
);

peopleRouter.patch(
  '/members/:id',
  ah(async (req, res) => {
    const input = parse(memberSchema, req.body);
    const { value, version } = await mutate((db) => {
      const member = db.members.find((m) => m.id === req.params.id);
      if (!member) throw notFound('Membro');
      if (nameTaken(db.members, input.name, member.id)) throw new HttpError(409, 'Já existe um membro com esse nome.');
      Object.assign(member, input);
      return member;
    });
    send(res, value, version);
  }),
);

peopleRouter.delete(
  '/members/:id',
  ah(async (req, res) => {
    const { version } = await mutate((db) => {
      const idx = db.members.findIndex((m) => m.id === req.params.id);
      if (idx === -1) throw notFound('Membro');
      const actor = actorId(req, db.members);
      const [member] = db.members.splice(idx, 1);
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
    });
    send(res, { ok: true }, version);
  }),
);

// ---------- Clients ----------
peopleRouter.post(
  '/clients',
  ah(async (req, res) => {
    const input = parse(clientSchema, req.body);
    const { value, version } = await mutate((db) => {
      if (nameTaken(db.clients, input.name)) throw new HttpError(409, 'Já existe um cliente com esse nome.');
      const client: Client = { id: randomUUID(), ...input, createdAt: now() };
      db.clients.push(client);
      return client;
    });
    send(res, value, version, 201);
  }),
);

peopleRouter.patch(
  '/clients/:id',
  ah(async (req, res) => {
    const input = parse(clientSchema, req.body);
    const { value, version } = await mutate((db) => {
      const client = db.clients.find((c) => c.id === req.params.id);
      if (!client) throw notFound('Cliente');
      if (nameTaken(db.clients, input.name, client.id)) throw new HttpError(409, 'Já existe um cliente com esse nome.');
      Object.assign(client, input);
      return client;
    });
    send(res, value, version);
  }),
);

peopleRouter.delete(
  '/clients/:id',
  ah(async (req, res) => {
    const { version } = await mutate((db) => {
      const idx = db.clients.findIndex((c) => c.id === req.params.id);
      if (idx === -1) throw notFound('Cliente');
      const [client] = db.clients.splice(idx, 1);
      for (const project of db.projects) {
        if (project.clientId === client.id) project.clientId = null;
      }
      for (const task of db.tasks) {
        if (task.clientId === client.id) {
          task.clientId = null;
          task.color = task.color ?? client.color;
          task.updatedAt = now();
        }
      }
    });
    send(res, { ok: true }, version);
  }),
);

peopleRouter.post(
  '/clients/:id/onboarding',
  ah(async (req, res) => {
    const input = parse(onboardingSchema, req.body);
    const { value, version } = await mutate((db) => {
      const client = db.clients.find((c) => c.id === req.params.id);
      if (!client) throw notFound('Cliente');
      const steps = db.settings.onboardingTemplate.filter((s) => input.stepIds.includes(s.id));
      if (!steps.length) throw new HttpError(400, 'Nenhuma etapa válida selecionada.');
      if (input.assigneeId && !db.members.some((m) => m.id === input.assigneeId)) {
        throw new HttpError(400, 'Responsável não encontrado(a).');
      }
      const actor = actorId(req, db.members);
      // Steps are created bottom-up so the first step ends up at the top of "A Fazer".
      const created = [...steps].reverse().map((step) =>
        createTask(
          db,
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
      return created.reverse();
    });
    send(res, { tasks: value }, version, 201);
  }),
);

// ---------- Projects ----------
peopleRouter.post(
  '/projects',
  ah(async (req, res) => {
    const input = parse(projectSchema, req.body);
    const { value, version } = await mutate((db) => {
      if (nameTaken(db.projects, input.name)) throw new HttpError(409, 'Já existe um projeto com esse nome.');
      ensureClient(db, input.clientId);
      const project: Project = { id: randomUUID(), ...input, createdAt: now() };
      db.projects.push(project);
      return project;
    });
    send(res, value, version, 201);
  }),
);

peopleRouter.patch(
  '/projects/:id',
  ah(async (req, res) => {
    const input = parse(projectSchema, req.body);
    const { value, version } = await mutate((db) => {
      const project = db.projects.find((p) => p.id === req.params.id);
      if (!project) throw notFound('Projeto');
      if (nameTaken(db.projects, input.name, project.id)) throw new HttpError(409, 'Já existe um projeto com esse nome.');
      ensureClient(db, input.clientId);
      Object.assign(project, input);
      return project;
    });
    send(res, value, version);
  }),
);

peopleRouter.delete(
  '/projects/:id',
  ah(async (req, res) => {
    const { version } = await mutate((db) => {
      const idx = db.projects.findIndex((p) => p.id === req.params.id);
      if (idx === -1) throw notFound('Projeto');
      const [project] = db.projects.splice(idx, 1);
      // Tasks are kept, just without a project.
      for (const task of db.tasks) {
        if (task.projectId === project.id) {
          task.projectId = null;
          task.updatedAt = now();
        }
      }
    });
    send(res, { ok: true }, version);
  }),
);

// ---------- Settings ----------
peopleRouter.put(
  '/settings',
  ah(async (req, res) => {
    const input = parse(settingsSchema, req.body);
    const { value, version } = await mutate((db) => {
      db.settings = { ...db.settings, ...input };
      return db.settings;
    });
    send(res, value, version);
  }),
);
