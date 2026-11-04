import type { Request, Response } from 'express';
import type { CommentInput, CommentParams, CommentsQuery, PanelParams } from './comments.schema.js';
import * as commentsService from './comments.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio.

export async function listComments(_req: Request, res: Response): Promise<void> {
  const params = res.locals.validated.params as PanelParams;
  const { page } = res.locals.validated.query as CommentsQuery;
  res.set('Cache-Control', 'no-store').json(await commentsService.listComments(params, page, res.locals.user));
}

// requireAuth va antes en la ruta: aquí siempre hay usuario.
export async function createComment(_req: Request, res: Response): Promise<void> {
  const params = res.locals.validated.params as PanelParams;
  const { body } = res.locals.validated.body as CommentInput;
  const comment = await commentsService.createComment(params, body, res.locals.user!);
  res.status(201).json({ comment });
}

export async function deleteComment(req: Request, res: Response): Promise<void> {
  const { id } = res.locals.validated.params as CommentParams;
  await commentsService.deleteOwnComment(id, res.locals.user!, { ip: req.ip ?? null, requestId: res.locals.requestId });
  res.status(204).end();
}
