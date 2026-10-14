import { randomUUID } from 'node:crypto';
import type { OnboardingStep, Project, Settings, Task } from '../shared/types.js';
import type { DbShape } from './store.js';

export function defaultSettings(): Settings {
  const step = (title: string, description: string, offsetDays: number, priority: OnboardingStep['priority']): OnboardingStep => ({
    id: randomUUID(),
    title,
    description,
    offsetDays,
    priority,
  });
  return {
    onboardingTemplate: [
      step('Reunião de kickoff', 'Alinhar objetivos, expectativas e pontos de contato com o cliente.', 0, 'high'),
      step('Coletar acessos e materiais', 'Solicitar logins, identidade visual, documentos e referências.', 2, 'high'),
      step('Configurar ferramentas e canais', 'Criar grupos de comunicação, pastas compartilhadas e acessos internos.', 3, 'medium'),
      step('Definir cronograma de entregas', 'Montar o plano de trabalho com marcos e responsáveis.', 5, 'medium'),
      step('Apresentar planejamento para aprovação', 'Validar o plano com o cliente e registrar ajustes.', 7, 'high'),
      step('Revisão de 30 dias', 'Avaliar a satisfação do cliente e os primeiros resultados.', 30, 'low'),
    ],
  };
}

export function emptyDb(): DbShape {
  return { taskCounter: 0, members: [], clients: [], projects: [], tasks: [], settings: defaultSettings() };
}

/** Fills fields that may be missing in data written by older versions, without discarding anything. */
export function normalizeDb(
  raw: Partial<Omit<DbShape, 'tasks' | 'projects'>> & { tasks?: Partial<Task>[]; projects?: Partial<Project>[] },
): DbShape {
  const base = emptyDb();
  const tasks = (raw.tasks ?? []).map((t) => ({
    ...t,
    descriptionMentions: t.descriptionMentions ?? [],
    participantIds: t.participantIds ?? [],
    attachments: t.attachments ?? [],
    comments: t.comments ?? [],
    history: t.history ?? [],
    projectId: t.projectId ?? null,
    scope: t.scope ?? 'team',
    ownerId: t.ownerId ?? null,
    onboarding: t.onboarding ?? false,
    archived: t.archived ?? false,
    archivedAt: t.archivedAt ?? null,
    completedAt: t.completedAt ?? null,
    color: t.color ?? null,
  })) as Task[];
  const projects = (raw.projects ?? []).map((p) => ({
    ...p,
    description: p.description ?? '',
    clientId: p.clientId ?? null,
    status: p.status ?? 'active',
  })) as Project[];
  const maxNumber = tasks.reduce((max, t) => Math.max(max, t.number ?? 0), 0);
  return {
    taskCounter: Math.max(raw.taskCounter ?? 0, maxNumber),
    members: raw.members ?? [],
    clients: raw.clients ?? [],
    projects,
    tasks,
    settings: { ...base.settings, ...(raw.settings ?? {}) },
  };
}

export function isEmpty(db: DbShape) {
  return db.members.length === 0 && db.clients.length === 0 && db.projects.length === 0 && db.tasks.length === 0;
}
