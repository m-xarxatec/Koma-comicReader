import type { NextFunction, Request, Response } from 'express';
import type { RejectInput } from '../admin/admin.schema.js';
import type { AdminIllustrationsQuery, BoardQuery, IllustrationInput, IllustrationParams, OwnQuery } from './illustrations.schema.js';
import * as illustrationsService from './illustrations.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio.

const context = (req: Request, res: Response) => ({ ip: req.ip ?? null, requestId: res.locals.requestId });

export async function listBoard(_req: Request, res: Response): Promise<void> {
  res.json(await illustrationsService.listBoard(res.locals.validated.query as BoardQuery));
}

// requireAuth va antes en la ruta: aquí siempre hay usuario.
export async function listOwn(_req: Request, res: Response): Promise<void> {
  const { page } = res.locals.validated.query as OwnQuery;
  res.set('Cache-Control', 'no-store').json(await illustrationsService.listOwn(res.locals.user!, page));
}

// Antes de multer: sin permiso (403) o con el tope de pendientes (409), no se escribe nada en disco.
export async function checkPublisher(_req: Request, res: Response, next: NextFunction): Promise<void> {
  await illustrationsService.checkPublisher(res.locals.user!);
  next();
}

export async function publish(req: Request, res: Response): Promise<void> {
  const input = res.locals.validated.body as IllustrationInput;
  const illustration = await illustrationsService.publish(res.locals.user!, input, req.file, context(req, res));
  res.status(201).json({ illustration });
}

// requireAuth va antes en la ruta; quién puede retirarla lo decide el servicio.
export async function withdraw(req: Request, res: Response): Promise<void> {
  const { id } = res.locals.validated.params as IllustrationParams;
  await illustrationsService.withdraw(res.locals.user!, id, context(req, res));
  res.status(204).end();
}

// --- Admin (requireAdmin va en el router de /api/admin) ---

export async function listForAdmin(_req: Request, res: Response): Promise<void> {
  const { status, page } = res.locals.validated.query as AdminIllustrationsQuery;
  res.set('Cache-Control', 'no-store').json(await illustrationsService.listForAdmin(status, page));
}

export async function approve(req: Request, res: Response): Promise<void> {
  const { id } = res.locals.validated.params as IllustrationParams;
  await illustrationsService.review(res.locals.user!, id, { decision: 'approve' }, context(req, res));
  res.status(204).end();
}

export async function reject(req: Request, res: Response): Promise<void> {
  const { id } = res.locals.validated.params as IllustrationParams;
  const { reason } = res.locals.validated.body as RejectInput;
  await illustrationsService.review(res.locals.user!, id, { decision: 'reject', reason }, context(req, res));
  res.status(204).end();
}
