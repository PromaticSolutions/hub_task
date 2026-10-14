import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Client, Member, Settings, Snapshot, Task } from '../shared/types';

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface DbShape {
  version: number;
  taskCounter: number;
  members: Member[];
  clients: Client[];
  tasks: Task[];
  settings: Settings;
}

export function defaultSettings(): Settings {
  const step = (title: string, description: string, offsetDays: number, priority: Settings['onboardingTemplate'][number]['priority']) => ({
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

function emptyDb(): DbShape {
  return { version: 1, taskCounter: 0, members: [], clients: [], tasks: [], settings: defaultSettings() };
}

/** Fills fields that may be missing in files written by older versions, without discarding data. */
function normalize(raw: Partial<Omit<DbShape, 'tasks'>> & { tasks?: Partial<Task>[] }): DbShape {
  const base = emptyDb();
  const tasks = (raw.tasks ?? []).map((t) => ({
    descriptionMentions: [],
    participantIds: [],
    attachments: [],
    comments: [],
    history: [],
    scope: 'team' as const,
    ownerId: null,
    onboarding: false,
    archived: false,
    archivedAt: null,
    completedAt: null,
    color: null,
    ...t,
  })) as Task[];
  const maxNumber = tasks.reduce((max, t) => Math.max(max, t.number ?? 0), 0);
  return {
    version: raw.version ?? base.version,
    taskCounter: Math.max(raw.taskCounter ?? 0, maxNumber),
    members: raw.members ?? [],
    clients: raw.clients ?? [],
    tasks,
    settings: { ...base.settings, ...(raw.settings ?? {}) },
  };
}

function load(): DbShape {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const fresh = emptyDb();
    writeFile(fresh);
    return fresh;
  }
  const text = fs.readFileSync(DB_FILE, 'utf8');
  try {
    return normalize(JSON.parse(text));
  } catch (err) {
    // Never overwrite an existing data file we could not parse.
    throw new Error(`Não foi possível ler ${DB_FILE}. Corrija ou mova o arquivo antes de iniciar o servidor. (${String(err)})`);
  }
}

function writeFile(data: DbShape) {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export const db: DbShape = load();

/** Persists the current state. `bumps` > 1 signals clients that more than their own change happened. */
export function commit(bumps = 1) {
  db.version += bumps;
  writeFile(db);
}

export function snapshot(): Snapshot {
  return { version: db.version, members: db.members, clients: db.clients, tasks: db.tasks, settings: db.settings };
}

export function isEmpty() {
  return db.members.length === 0 && db.clients.length === 0 && db.tasks.length === 0;
}

export function removeStoredFile(storedName: string) {
  const file = path.join(UPLOAD_DIR, path.basename(storedName));
  fs.rm(file, { force: true }, () => {});
}
