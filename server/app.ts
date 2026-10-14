import express from 'express';
import { isEmpty } from './defaults.js';
import { HttpError, ah, errorHandler, send } from './http.js';
import { peopleRouter } from './people.js';
import { loadSampleData } from './sample.js';
import { currentVersion, getStore, mutate, readState } from './store.js';
import { tasksRouter } from './tasks.js';

/** The API, shared by the local server (server/index.ts) and the Vercel function (api/index.ts). */
export const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const api = express.Router();

api.get(
  '/health',
  ah(async (_req, res) => {
    const store = await getStore();
    res.json({ ok: true, storage: store.kind });
  }),
);

api.get(
  '/snapshot',
  ah(async (_req, res) => {
    const { db, version } = await readState();
    res.setHeader('Cache-Control', 'no-store');
    send(res, { version, ...db }, version);
  }),
);

api.get(
  '/version',
  ah(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ version: await currentVersion() });
  }),
);

api.post(
  '/sample-data',
  ah(async (_req, res) => {
    await mutate((db) => {
      if (!isEmpty(db)) throw new HttpError(409, 'Os dados de exemplo só podem ser carregados com o sistema vazio.');
      loadSampleData(db);
    });
    const { db, version } = await readState();
    send(res, { version, ...db }, version, 201);
  }),
);

api.get(
  '/export',
  ah(async (_req, res) => {
    const { db, version } = await readState();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="hub-task-backup-${stamp}.json"`);
    res.json({ exportedAt: new Date().toISOString(), version, ...db });
  }),
);

api.use(tasksRouter);
api.use(peopleRouter);
api.use((_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));

app.use('/api', api);
app.use('/api', errorHandler);
