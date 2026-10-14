import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { DATA_DIR, commit, db, isEmpty, snapshot } from './db';
import { HttpError, errorHandler, send } from './http';
import { peopleRouter } from './people';
import { loadSampleData } from './sample';
import { tasksRouter } from './tasks';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const api = express.Router();

api.get('/health', (_req, res) => res.json({ ok: true }));
api.get('/snapshot', (_req, res) => send(res, snapshot()));
api.get('/version', (_req, res) => res.json({ version: db.version }));

api.post('/sample-data', (_req, res) => {
  if (!isEmpty()) throw new HttpError(409, 'Os dados de exemplo só podem ser carregados com o sistema vazio.');
  loadSampleData();
  commit();
  send(res, snapshot(), 201);
});

api.get('/export', (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="hub-task-backup-${stamp}.json"`);
  res.json({ exportedAt: new Date().toISOString(), ...snapshot() });
});

api.use(tasksRouter);
api.use(peopleRouter);
api.use((_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));

app.use('/api', api);

// Serves the production build when it exists (npm run build && npm start).
const dist = path.resolve(process.cwd(), 'dist');
const hasBuild = fs.existsSync(path.join(dist, 'index.html'));
if (hasBuild) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  // Without a build this port only serves the API; point lost visitors to the interface.
  app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Hub Task Timely · API</title>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 24px;line-height:1.55;color:#12211a">
<h1 style="font-size:20px">Esta é a API do Hub Task Timely</h1>
<p>A interface não é servida nesta porta durante o desenvolvimento. Com <code>npm run dev</code> rodando, abra
<a href="http://localhost:5173">http://localhost:5173</a>.</p>
<p>Para servir tudo nesta porta, rode <code>npm run build</code> e depois <code>npm start</code>.</p></body></html>`);
  });
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`API pronta em http://localhost:${PORT} (dados em ${DATA_DIR})`);
  console.log(
    hasBuild
      ? `Interface disponível em http://localhost:${PORT}`
      : 'Interface: abra o endereço "Local" mostrado pelo Vite (normalmente http://localhost:5173).',
  );
});
