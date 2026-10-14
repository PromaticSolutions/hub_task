import postgres from 'postgres';
import type { Client, Member, Project, Settings, Task } from '../shared/types.js';
import { defaultSettings } from './defaults.js';
import type { DbShape, StoreBackend } from './store.js';

/** Supabase's Vercel integration exposes POSTGRES_URL; DATABASE_URL works everywhere else. */
export function databaseUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

// Arbitrary keys for transaction-scoped advisory locks.
const LOCK_SCHEMA = 7_400_001;
const LOCK_WRITE = 7_400_002;

const SCHEMA = `
create table if not exists app_meta (
  id smallint primary key default 1 check (id = 1),
  version integer not null default 1,
  task_counter integer not null default 0
);
insert into app_meta (id) values (1) on conflict (id) do nothing;

create table if not exists app_settings (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null
);

create table if not exists members (
  id uuid primary key,
  name text not null,
  email text not null default '',
  role text not null default '',
  color text not null,
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key,
  name text not null,
  color text not null,
  contact_name text not null default '',
  email text not null default '',
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key,
  name text not null,
  color text not null,
  description text not null default '',
  client_id uuid references clients (id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key,
  number integer not null,
  title text not null,
  description text not null default '',
  description_mentions jsonb not null default '[]',
  client_id uuid references clients (id) on delete set null,
  project_id uuid references projects (id) on delete set null,
  color text,
  assignee_id uuid references members (id) on delete set null,
  participant_ids jsonb not null default '[]',
  priority text not null,
  status text not null,
  sort_order double precision not null default 0,
  scope text not null default 'team',
  owner_id uuid references members (id) on delete set null,
  onboarding boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  due_date date,
  completed_at timestamptz,
  archived boolean not null default false,
  archived_at timestamptz,
  attachments jsonb not null default '[]',
  comments jsonb not null default '[]',
  history jsonb not null default '[]'
);
create index if not exists tasks_status_idx on tasks (status);
create index if not exists tasks_client_idx on tasks (client_id);

-- Databases created before projects existed get the column here. Checking first avoids
-- taking an exclusive lock on tasks at every cold start.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'tasks' and column_name = 'project_id'
  ) then
    alter table tasks add column project_id uuid references projects (id) on delete set null;
  end if;
end $$;
create index if not exists tasks_project_idx on tasks (project_id);

-- Only the server (table owner) reads these tables; Supabase's public API gets no access.
alter table app_meta enable row level security;
alter table app_settings enable row level security;
alter table members enable row level security;
alter table clients enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
`;

/** Keeps the parts of the URL the driver understands; Supabase adds params like `supa=` or `pgbouncer=`. */
function cleanUrl(raw: string) {
  const url = new URL(raw);
  for (const key of ['supa', 'pgbouncer', 'sslmode', 'sslrootcert', 'connection_limit']) url.searchParams.delete(key);
  return url.toString();
}

function isLocal(raw: string) {
  const host = new URL(raw).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

type Sql = postgres.Sql;
type Tx = postgres.TransactionSql;
type Row = Record<string, unknown>;

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));

function rowToMember(r: Row): Member {
  return {
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    role: r.role as string,
    color: r.color as string,
    createdAt: iso(r.created_at),
  };
}

function rowToClient(r: Row): Client {
  return {
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
    contactName: r.contact_name as string,
    email: r.email as string,
    phone: r.phone as string,
    notes: r.notes as string,
    createdAt: iso(r.created_at),
  };
}

function rowToProject(r: Row): Project {
  return {
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
    description: r.description as string,
    clientId: (r.client_id as string | null) ?? null,
    status: r.status as Project['status'],
    createdAt: iso(r.created_at),
  };
}

function rowToTask(r: Row): Task {
  return {
    id: r.id as string,
    number: r.number as number,
    title: r.title as string,
    description: r.description as string,
    descriptionMentions: r.description_mentions as string[],
    clientId: (r.client_id as string | null) ?? null,
    projectId: (r.project_id as string | null) ?? null,
    color: (r.color as string | null) ?? null,
    assigneeId: (r.assignee_id as string | null) ?? null,
    participantIds: r.participant_ids as string[],
    priority: r.priority as Task['priority'],
    status: r.status as Task['status'],
    order: r.sort_order as number,
    scope: r.scope as Task['scope'],
    ownerId: (r.owner_id as string | null) ?? null,
    onboarding: r.onboarding as boolean,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    createdBy: (r.created_by as string | null) ?? null,
    dueDate: (r.due_date_text as string | null) ?? null,
    completedAt: isoOrNull(r.completed_at),
    archived: r.archived as boolean,
    archivedAt: isoOrNull(r.archived_at),
    attachments: r.attachments as Task['attachments'],
    comments: r.comments as Task['comments'],
    history: r.history as Task['history'],
  };
}

/** Column name, SQL cast and value getter. Text casts keep the driver from re-encoding JSON and dates. */
type Col<T> = [column: string, cast: string, get: (e: T) => unknown];

const json = (v: unknown) => JSON.stringify(v);

const MEMBER_COLS: Col<Member>[] = [
  ['id', 'uuid', (m) => m.id],
  ['name', 'text', (m) => m.name],
  ['email', 'text', (m) => m.email],
  ['role', 'text', (m) => m.role],
  ['color', 'text', (m) => m.color],
  ['created_at', 'text::timestamptz', (m) => m.createdAt],
];

const CLIENT_COLS: Col<Client>[] = [
  ['id', 'uuid', (c) => c.id],
  ['name', 'text', (c) => c.name],
  ['color', 'text', (c) => c.color],
  ['contact_name', 'text', (c) => c.contactName],
  ['email', 'text', (c) => c.email],
  ['phone', 'text', (c) => c.phone],
  ['notes', 'text', (c) => c.notes],
  ['created_at', 'text::timestamptz', (c) => c.createdAt],
];

const PROJECT_COLS: Col<Project>[] = [
  ['id', 'uuid', (p) => p.id],
  ['name', 'text', (p) => p.name],
  ['color', 'text', (p) => p.color],
  ['description', 'text', (p) => p.description],
  ['client_id', 'uuid', (p) => p.clientId],
  ['status', 'text', (p) => p.status],
  ['created_at', 'text::timestamptz', (p) => p.createdAt],
];

const TASK_COLS: Col<Task>[] = [
  ['id', 'uuid', (t) => t.id],
  ['number', 'int', (t) => t.number],
  ['title', 'text', (t) => t.title],
  ['description', 'text', (t) => t.description],
  ['description_mentions', 'text::jsonb', (t) => json(t.descriptionMentions)],
  ['client_id', 'uuid', (t) => t.clientId],
  ['project_id', 'uuid', (t) => t.projectId],
  ['color', 'text', (t) => t.color],
  ['assignee_id', 'uuid', (t) => t.assigneeId],
  ['participant_ids', 'text::jsonb', (t) => json(t.participantIds)],
  ['priority', 'text', (t) => t.priority],
  ['status', 'text', (t) => t.status],
  ['sort_order', 'float8', (t) => t.order],
  ['scope', 'text', (t) => t.scope],
  ['owner_id', 'uuid', (t) => t.ownerId],
  ['onboarding', 'boolean', (t) => t.onboarding],
  ['created_at', 'text::timestamptz', (t) => t.createdAt],
  ['updated_at', 'text::timestamptz', (t) => t.updatedAt],
  ['created_by', 'uuid', (t) => t.createdBy],
  ['due_date', 'text::date', (t) => t.dueDate],
  ['completed_at', 'text::timestamptz', (t) => t.completedAt],
  ['archived', 'boolean', (t) => t.archived],
  ['archived_at', 'text::timestamptz', (t) => t.archivedAt],
  ['attachments', 'text::jsonb', (t) => json(t.attachments)],
  ['comments', 'text::jsonb', (t) => json(t.comments)],
  ['history', 'text::jsonb', (t) => json(t.history)],
];

async function upsert<T>(tx: Tx, table: string, cols: Col<T>[], entity: T) {
  const names = cols.map((c) => c[0]);
  const placeholders = cols.map((c, i) => `$${i + 1}::${c[1]}`);
  const updates = names.filter((n) => n !== 'id').map((n) => `${n} = excluded.${n}`);
  const text = `insert into ${table} (${names.join(', ')}) values (${placeholders.join(', ')}) on conflict (id) do update set ${updates.join(', ')}`;
  await tx.unsafe(text, cols.map((c) => (c[2](entity) ?? null) as postgres.ParameterOrJSON<never>));
}

async function removeIds(tx: Tx, table: string, ids: string[]) {
  if (!ids.length) return;
  await tx.unsafe(`delete from ${table} where id = any(string_to_array($1::text, ',')::uuid[])`, [ids.join(',')]);
}

async function loadAll(q: Sql | Tx): Promise<{ db: DbShape; version: number }> {
  const [meta] = await q`select version, task_counter from app_meta where id = 1`;
  const [settingsRow] = await q`select data from app_settings where id = 1`;
  const members = await q`select * from members order by created_at, id`;
  const clients = await q`select * from clients order by created_at, id`;
  const projects = await q`select * from projects order by created_at, id`;
  const tasks = await q`select *, due_date::text as due_date_text from tasks order by number`;
  return {
    version: (meta?.version as number) ?? 1,
    db: {
      taskCounter: (meta?.task_counter as number) ?? 0,
      settings: (settingsRow?.data as Settings) ?? defaultSettings(),
      members: members.map(rowToMember),
      clients: clients.map(rowToClient),
      projects: projects.map(rowToProject),
      tasks: tasks.map(rowToTask),
    },
  };
}

function index<T extends { id: string }>(list: T[]) {
  return new Map(list.map((e) => [e.id, JSON.stringify(e)]));
}

/** Writes only what changed. Order respects foreign keys (people and projects before tasks, tasks before them are deleted). */
async function persistChanges(tx: Tx, before: ReturnType<typeof snapshotOf>, db: DbShape) {
  const changed = <T extends { id: string }>(prev: Map<string, string>, list: T[]) =>
    list.filter((e) => prev.get(e.id) !== JSON.stringify(e));
  const removed = <T extends { id: string }>(prev: Map<string, string>, list: T[]) => {
    const now = new Set(list.map((e) => e.id));
    return [...prev.keys()].filter((id) => !now.has(id));
  };

  for (const m of changed(before.members, db.members)) await upsert(tx, 'members', MEMBER_COLS, m);
  for (const c of changed(before.clients, db.clients)) await upsert(tx, 'clients', CLIENT_COLS, c);
  for (const p of changed(before.projects, db.projects)) await upsert(tx, 'projects', PROJECT_COLS, p);
  for (const t of changed(before.tasks, db.tasks)) await upsert(tx, 'tasks', TASK_COLS, t);
  await removeIds(tx, 'tasks', removed(before.tasks, db.tasks));
  await removeIds(tx, 'projects', removed(before.projects, db.projects));
  await removeIds(tx, 'clients', removed(before.clients, db.clients));
  await removeIds(tx, 'members', removed(before.members, db.members));
  if (JSON.stringify(db.settings) !== before.settings) {
    await tx.unsafe(
      `insert into app_settings (id, data) values (1, $1::text::jsonb) on conflict (id) do update set data = excluded.data`,
      [JSON.stringify(db.settings)],
    );
  }
}

function snapshotOf(db: DbShape) {
  return {
    members: index(db.members),
    clients: index(db.clients),
    projects: index(db.projects),
    tasks: index(db.tasks),
    settings: JSON.stringify(db.settings),
  };
}

export async function createPgStore(rawUrl: string): Promise<StoreBackend> {
  const sql = postgres(cleanUrl(rawUrl), {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    ssl: isLocal(rawUrl) ? false : 'require',
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });

  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK_SCHEMA})`;
    await tx.unsafe(SCHEMA);
    await tx.unsafe(`insert into app_settings (id, data) values (1, $1::text::jsonb) on conflict (id) do nothing`, [
      JSON.stringify(defaultSettings()),
    ]);
  });

  return {
    kind: 'postgres',
    read: () => sql.begin('isolation level repeatable read read only', (tx) => loadAll(tx)) as Promise<{ db: DbShape; version: number }>,
    version: async () => {
      const [row] = await sql`select version from app_meta where id = 1`;
      return (row?.version as number) ?? 1;
    },
    transact: (fn, bumps) =>
      sql.begin(async (tx) => {
        // One writer at a time, like the local single-process server.
        await tx`select pg_advisory_xact_lock(${LOCK_WRITE})`;
        const { db } = await loadAll(tx);
        const before = snapshotOf(db);
        await fn(db);
        await persistChanges(tx, before, db);
        const [row] = await tx`update app_meta set version = version + ${bumps()}, task_counter = ${db.taskCounter} where id = 1 returning version`;
        return row.version as number;
      }) as Promise<number>,
  };
}
