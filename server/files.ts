import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Attachment } from '../shared/types.js';
import { HttpError } from './http.js';
import { UPLOAD_DIR } from './store-file.js';

export const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** Images and PDFs render inline; everything else (including SVG/HTML) is forced to download. */
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

export interface FileStorage {
  readonly kind: 'local' | 'supabase';
  /** Where the browser sends the file bytes (PUT, raw body). */
  signUpload(storedName: string): Promise<{ url: string; headers: Record<string, string> }>;
  exists(storedName: string): Promise<boolean>;
  sendDownload(res: Response, attachment: Attachment, forceDownload: boolean): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  remove(storedNames: string[]): Promise<void>;
  /** Server-side write (used when importing local data). */
  put(storedName: string, data: Buffer, contentType: string): Promise<void>;
}

export function newStoredName(originalName: string) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
  return `${randomUUID()}${ext}`;
}

export const STORED_NAME = /^[0-9a-f-]{36}(\.[a-z0-9]{1,11})?$/;

const shouldInline = (a: Attachment, forceDownload: boolean) => INLINE_TYPES.has(a.mimeType) && !forceDownload;

/* ---------------- Local disk (development) ---------------- */

const uploadTokens = new Map<string, number>();

function createLocalStorage(): FileStorage {
  const file = (name: string) => path.join(UPLOAD_DIR, path.basename(name));
  return {
    kind: 'local',
    async signUpload(storedName) {
      const token = randomUUID();
      uploadTokens.set(`${storedName}:${token}`, Date.now() + 15 * 60_000);
      return { url: `/api/uploads/${storedName}?token=${token}`, headers: {} };
    },
    async exists(storedName) {
      return fs.existsSync(file(storedName));
    },
    async sendDownload(res, attachment, forceDownload) {
      const target = file(attachment.storedName);
      if (!fs.existsSync(target)) throw new HttpError(410, 'O arquivo deste anexo não está mais disponível.');
      const inline = shouldInline(attachment, forceDownload);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
      res.setHeader('Content-Type', inline ? attachment.mimeType : 'application/octet-stream');
      res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`);
      res.sendFile(target);
    },
    async copy(from, to) {
      fs.copyFileSync(file(from), file(to));
    },
    async remove(names) {
      for (const n of names) fs.rmSync(file(n), { force: true });
    },
    async put(storedName, data) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(file(storedName), data);
    },
  };
}

/** Accepts the bytes for a signed local upload. Returns false if the token is unknown or expired. */
export function acceptLocalUpload(storedName: string, token: string, body: Buffer): boolean {
  const key = `${storedName}:${token}`;
  const expires = uploadTokens.get(key);
  if (!expires || expires < Date.now() || !STORED_NAME.test(storedName)) return false;
  uploadTokens.delete(key);
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), body);
  return true;
}

/* ---------------- Supabase Storage (production) ---------------- */

function supabaseCredentials() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

function createSupabaseStorage(url: string, key: string): FileStorage {
  const bucket = process.env.SUPABASE_BUCKET || 'attachments';
  // Loaded on demand so local runs (no Supabase) never import the SDK.
  let clientPromise: Promise<SupabaseClient> | null = null;
  const getClient = () =>
    (clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    ));
  let client!: SupabaseClient;
  let ready: Promise<void> | null = null;

  const ensureBucket = () => {
    ready ??= (async () => {
      client = await getClient();
      const { error } = await client.storage.getBucket(bucket);
      if (!error) return;
      const created = await client.storage.createBucket(bucket, { public: false, fileSizeLimit: MAX_FILE_SIZE });
      if (created.error && !/already exists/i.test(created.error.message)) {
        throw new Error(`Não foi possível criar o bucket "${bucket}" no Supabase: ${created.error.message}`);
      }
    })().catch((err) => {
      ready = null;
      throw err;
    });
    return ready;
  };

  // ensureBucket() runs before every operation, so `client` is set by the time this is used.
  const files = () => client.storage.from(bucket);
  const fail = (what: string, message: string) => new HttpError(502, `Falha no armazenamento de arquivos (${what}): ${message}`);

  return {
    kind: 'supabase',
    async signUpload(storedName) {
      await ensureBucket();
      const { data, error } = await files().createSignedUploadUrl(storedName);
      if (error) throw fail('envio', error.message);
      return { url: data.signedUrl, headers: { 'x-upsert': 'false' } };
    },
    async exists(storedName) {
      await ensureBucket();
      const { data } = await files().exists(storedName);
      return !!data;
    },
    async sendDownload(res, attachment, forceDownload) {
      await ensureBucket();
      const inline = shouldInline(attachment, forceDownload);
      const { data, error } = await files().createSignedUrl(attachment.storedName, 300, {
        download: inline ? false : attachment.name,
      });
      if (error) throw new HttpError(410, 'O arquivo deste anexo não está mais disponível.');
      res.setHeader('Cache-Control', 'private, no-store');
      res.redirect(302, data.signedUrl);
    },
    async copy(from, to) {
      await ensureBucket();
      const { error } = await files().copy(from, to);
      if (error) throw fail('cópia', error.message);
    },
    async remove(names) {
      if (!names.length) return;
      await ensureBucket();
      const { error } = await files().remove(names);
      if (error) throw fail('remoção', error.message);
    },
    async put(storedName, data, contentType) {
      await ensureBucket();
      const { error } = await files().upload(storedName, data, { contentType, upsert: true });
      if (error) throw fail('envio', error.message);
    },
  };
}

let storage: FileStorage | null = null;

export function getFileStorage(): FileStorage {
  if (!storage) {
    const creds = supabaseCredentials();
    if (creds) storage = createSupabaseStorage(creds.url, creds.key);
    else if (process.env.VERCEL) {
      throw new HttpError(500, 'Armazenamento de anexos não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.');
    } else storage = createLocalStorage();
  }
  return storage;
}
