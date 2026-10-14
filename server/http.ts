import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import type { Member } from '../shared/types.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} não encontrado(a).`);

export function parse<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  return schema.parse(body);
}

/** Member id of whoever is using the app, sent by the client as a header (no auth in this version). */
export function actorId(req: Request, members: Pick<Member, 'id'>[]): string | null {
  const id = req.header('x-actor-id');
  return id && members.some((m) => m.id === id) ? id : null;
}

/** Lets Express 4 route errors thrown by async handlers to the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function send(res: Response, body: unknown, version: number, status = 200) {
  res.status(status).setHeader('x-data-version', String(version)).json(body);
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
  const type = (err as { type?: string })?.type;
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'Arquivo muito grande (máximo de 25 MB).' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
}
