import type { Client, Member, Settings, Task } from '../shared/types.js';
import { createFileStore } from './store-file.js';
import { createPgStore, databaseUrl } from './store-pg.js';

export interface DbShape {
  taskCounter: number;
  members: Member[];
  clients: Client[];
  tasks: Task[];
  settings: Settings;
}

export interface StoreBackend {
  readonly kind: 'file' | 'postgres';
  /** Consistent read of everything. Callers must not mutate the result. */
  read(): Promise<{ db: DbShape; version: number }>;
  version(): Promise<number>;
  /**
   * Runs `fn` with exclusive access to a fresh copy of the data and persists what it changed.
   * Nothing is saved if `fn` throws. Returns the new data version.
   */
  transact(fn: (db: DbShape) => Promise<void> | void, bumps: () => number): Promise<number>;
}

export interface MutationContext {
  /** Signals that more than the caller's own change happened (clients then refetch everything). */
  bump(extra?: number): void;
  /** Runs after a successful commit (e.g. deleting files of removed attachments). */
  afterCommit(fn: () => Promise<unknown> | unknown): void;
}

let backend: Promise<StoreBackend> | null = null;

/** Postgres (Supabase) when DATABASE_URL/POSTGRES_URL is set, otherwise the local JSON file. */
export function getStore(): Promise<StoreBackend> {
  if (!backend) {
    const url = databaseUrl();
    backend = url ? createPgStore(url) : Promise.resolve(createFileStore());
    backend.catch(() => {
      backend = null;
    });
  }
  return backend;
}

export async function readState() {
  return (await getStore()).read();
}

export async function currentVersion() {
  return (await getStore()).version();
}

export async function mutate<T>(fn: (db: DbShape, ctx: MutationContext) => T | Promise<T>): Promise<{ value: T; version: number }> {
  const store = await getStore();
  let extra = 0;
  let after: Array<() => Promise<unknown> | unknown> = [];
  let value!: T;
  const version = await store.transact(
    async (db) => {
      extra = 0;
      after = [];
      value = await fn(db, {
        bump: (n = 1) => {
          extra += n;
        },
        afterCommit: (cb) => {
          after.push(cb);
        },
      });
    },
    () => 1 + extra,
  );
  for (const cb of after) {
    try {
      await cb();
    } catch (err) {
      console.error('Falha em tarefa pós-gravação:', err);
    }
  }
  return { value, version };
}
