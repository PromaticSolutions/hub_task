import fs from 'node:fs';
import path from 'node:path';
import { emptyDb, normalizeDb } from './defaults.js';
import { HttpError } from './http.js';
import type { DbShape, StoreBackend } from './store.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface FileState {
  version: number;
  db: DbShape;
}

function writeFile(state: FileState) {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: state.version, ...state.db }, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function load(): FileState {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const fresh = { version: 1, db: emptyDb() };
    writeFile(fresh);
    return fresh;
  }
  const text = fs.readFileSync(DB_FILE, 'utf8');
  try {
    const raw = JSON.parse(text);
    return { version: raw.version ?? 1, db: normalizeDb(raw) };
  } catch (err) {
    // Never overwrite an existing data file we could not parse.
    throw new Error(`Não foi possível ler ${DB_FILE}. Corrija ou mova o arquivo antes de iniciar o servidor. (${String(err)})`);
  }
}

/** Local JSON file storage: one process, writes serialized through a promise chain. */
export function createFileStore(): StoreBackend {
  if (process.env.VERCEL) {
    throw new HttpError(
      500,
      'Banco de dados não configurado. Defina DATABASE_URL (ou conecte o Supabase ao projeto na Vercel) e faça um novo deploy.',
    );
  }
  let state = load();
  let queue: Promise<unknown> = Promise.resolve();

  return {
    kind: 'file',
    read: async () => ({ db: state.db, version: state.version }),
    version: async () => state.version,
    transact(fn, bumps) {
      const run = queue.then(async () => {
        // Work on a copy so a failure halfway never leaves partial changes behind.
        const draft = structuredClone(state.db);
        await fn(draft);
        const next = { version: state.version + bumps(), db: draft };
        writeFile(next);
        state = next;
        return next.version;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
