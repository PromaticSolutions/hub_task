import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { db } from './db';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} não encontrado(a).`);

export function parse<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  return schema.parse(body);
}

/** Member id of whoever is using the app, sent by the client as a header (no auth in this version). */
export function actorId(req: Request): string | null {
  const id = req.header('x-actor-id');
  return id && db.members.some((m) => m.id === id) ? id : null;
}

export function send(res: Response, body: unknown, status = 200) {
  res.status(status).setHeader('x-data-version', String(db.version)).json(body);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join('.') || 'dados';
    res.status(400).json({ error: `Campo inválido (${field}): ${first?.message ?? 'valor inválido'}` });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const code = (err as { code?: string })?.code;
  if (code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Arquivo muito grande (máximo de 25 MB).' });
    return;
  }
  if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(400).json({ error: 'Envie no máximo 10 arquivos por vez.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
}
