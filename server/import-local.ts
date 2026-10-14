import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { isEmpty, normalizeDb } from './defaults.js';
import { getFileStorage } from './files.js';
import { DATA_DIR, UPLOAD_DIR } from './store-file.js';
import { createPgStore, databaseUrl } from './store-pg.js';

/**
 * Copies the local data (data/db.json + data/uploads) into Supabase.
 * Refuses to run if the database already has data, so nothing is overwritten.
 */
async function main() {
  const url = databaseUrl();
  if (!url) throw new Error('Defina DATABASE_URL no arquivo .env antes de importar.');
  const file = path.join(DATA_DIR, 'db.json');
  if (!fs.existsSync(file)) throw new Error(`Arquivo ${file} não encontrado.`);
  const local = normalizeDb(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (isEmpty(local)) throw new Error('Os dados locais estão vazios; não há nada para importar.');

  const store = await createPgStore(url);
  const target = await store.read();
  if (!isEmpty(target.db)) throw new Error('O banco do Supabase já tem dados. A importação foi cancelada para não sobrescrever nada.');

  const storage = getFileStorage();
  const attachments = local.tasks.flatMap((t) => t.attachments);
  let missing = 0;
  for (const a of attachments) {
    const source = path.join(UPLOAD_DIR, path.basename(a.storedName));
    if (!fs.existsSync(source)) {
      missing += 1;
      continue;
    }
    await storage.put(a.storedName, fs.readFileSync(source), a.mimeType);
  }

  await store.transact((db) => {
    if (!isEmpty(db)) throw new Error('O banco recebeu dados durante a importação. Nada foi gravado.');
    db.members = local.members;
    db.clients = local.clients;
    db.tasks = local.tasks;
    db.settings = local.settings;
    db.taskCounter = local.taskCounter;
  }, () => 1);

  console.log(
    `Importação concluída: ${local.members.length} membros, ${local.clients.length} clientes, ${local.tasks.length} tarefas, ${attachments.length - missing} anexos.`,
  );
  if (missing) console.log(`${missing} anexo(s) não foram encontrados em ${UPLOAD_DIR} e ficaram sem arquivo.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
