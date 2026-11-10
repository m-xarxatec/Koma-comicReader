import type { Request, Response } from 'express';
import { sendPage } from '../../utils/page.js';
import type { ComicParams } from '../comics/comics.schema.js';
import type { CommentParams } from '../comments/comments.schema.js';
import * as commentsService from '../comments/comments.service.js';
import type { ChapterParams } from '../reading/reading.schema.js';
import type { AdminUserChange } from '../auth/permissions.js';
import * as usersService from '../users/users.service.js';
import type { AdminCommentsQuery, AdminUserInput, AdminUsersQuery, AuditQueryInput, ReadingSettingsInput, RejectInput, UserParams } from './admin.schema.js';
import * as adminService from './admin.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio. requireAdmin va en el router: aquí siempre hay un admin.

const context = (req: Request, res: Response) => ({ ip: req.ip ?? null, requestId: res.locals.requestId });

// --- Aprobación (CU-32) ---

export async function getReviewQueue(_req: Request, res: Response): Promise<void> {
  res.json(await adminService.getReviewQueue());
}

export async function approveComic(req: Request, res: Response): Promise<void> {
  const { slug } = res.locals.validated.params as ComicParams;
  await adminService.reviewComic(res.locals.user!, slug, { decision: 'approve' }, context(req, res));
  res.status(204).end();
}

export async function rejectComic(req: Request, res: Response): Promise<void> {
  const { slug } = res.locals.validated.params as ComicParams;
  const { reason } = res.locals.validated.body as RejectInput;
  await adminService.reviewComic(res.locals.user!, slug, { decision: 'reject', reason }, context(req, res));
  res.status(204).end();
}

export async function approveChapter(req: Request, res: Response): Promise<void> {
  const { slug, number } = res.locals.validated.params as ChapterParams;
  await adminService.reviewChapter(res.locals.user!, slug, number, { decision: 'approve' }, context(req, res));
  res.status(204).end();
}

export async function rejectChapter(req: Request, res: Response): Promise<void> {
  const { slug, number } = res.locals.validated.params as ChapterParams;
  const { reason } = res.locals.validated.body as RejectInput;
  await adminService.reviewChapter(res.locals.user!, slug, number, { decision: 'reject', reason }, context(req, res));
  res.status(204).end();
}

// --- Moderación (CU-33) ---

export async function listComments(_req: Request, res: Response): Promise<void> {
  res.json(await commentsService.listForModeration(res.locals.validated.query as AdminCommentsQuery));
}

export async function hideComment(req: Request, res: Response): Promise<void> {
  const { id } = res.locals.validated.params as CommentParams;
  await commentsService.moderateComment(res.locals.user!, id, 'hide', context(req, res));
  res.status(204).end();
}

export async function deleteComment(req: Request, res: Response): Promise<void> {
  const { id } = res.locals.validated.params as CommentParams;
  await commentsService.moderateComment(res.locals.user!, id, 'delete', context(req, res));
  res.status(204).end();
}

// --- Usuarios (CU-35) ---

export async function listUsers(_req: Request, res: Response): Promise<void> {
  res.json(await usersService.listUsers(res.locals.user!, res.locals.validated.query as AdminUsersQuery));
}

// El schema garantiza exactamente un campo (D6).
function toChange(body: AdminUserInput): AdminUserChange {
  if (body.role !== undefined) return { role: body.role };
  if (body.isAuthor !== undefined) return { isAuthor: body.isAuthor };
  return { status: body.status! };
}

export async function changeUser(req: Request, res: Response): Promise<void> {
  const { id } = res.locals.validated.params as UserParams;
  const change = toChange(res.locals.validated.body as AdminUserInput);
  res.json({ user: await usersService.changeUser(res.locals.user!, id, change, context(req, res)) });
}

// --- Parámetros de lectura (CU-36) ---

export async function getSettings(_req: Request, res: Response): Promise<void> {
  res.json({ settings: await adminService.getReadingSettings() });
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  const input = res.locals.validated.body as ReadingSettingsInput;
  res.json({ settings: await adminService.updateReadingSettings(res.locals.user!, input, context(req, res)) });
}

// --- Auditoría (CU-40) ---

export async function searchAudit(_req: Request, res: Response): Promise<void> {
  res.json(await adminService.searchAudit(res.locals.validated.query as AuditQueryInput));
}

// --- Estadísticas globales (CU-39; RN-20) ---

export async function getStats(_req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store').json({ stats: await adminService.getPlatformStats() });
}

// /admin: requirePageAdmin va antes en la ruta (sin sesión, 302 a /entrar; sin rol admin, 403).
export async function adminPage(_req: Request, res: Response): Promise<void> {
  await sendPage(res, 'admin');
}
