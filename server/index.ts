import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { app } from './app.js';
import { errorHandler } from './http.js';
import { getStore } from './store.js';

const PORT = Number(process.env.PORT ?? 3001);

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

getStore()
  .then((store) => {
    app.listen(PORT, () => {
      const where = store.kind === 'postgres' ? 'Postgres (DATABASE_URL)' : `arquivo local em ${process.env.DATA_DIR ?? 'data/'}`;
      console.log(`API pronta em http://localhost:${PORT} · dados: ${where}`);
      console.log(
        hasBuild
          ? `Interface disponível em http://localhost:${PORT}`
          : 'Interface: abra o endereço "Local" mostrado pelo Vite (normalmente http://localhost:5173).',
      );
    });
  })
  .catch((err) => {
    console.error('Não foi possível iniciar o armazenamento de dados:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
