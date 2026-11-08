import { ADMIN_PAGE_SIZE, COMMENTS_PAGE_SIZE } from '../../config/limits.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../utils/app-error.js';
import * as audit from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { canComment, canDeleteOwnComment } from '../auth/permissions.js';
import * as chaptersRepository from '../chapters/chapters.repository.js';
import { escapeLike } from '../comics/comics.repository.js';
import * as readingRepository from '../reading/reading.repository.js';
import { requirePublicChapter } from '../reading/reading.service.js';
import type { User } from '../users/users.repository.js';
import * as commentsRepository from './comments.repository.js';

// Comentarios por viñeta (CU-05, CU-13; RN-11; contrato del bloque 3). Solo en viñetas de capítulos públicos
// (aprobados, no retirados, de una obra pública). La moderación del admin (ocultar, eliminar), al final (bloque 4).

export interface CommentDto {
  id: number;
  body: string; // texto plano; el cliente lo pinta con textContent
  authorName: string; // nombre visible de quien lo escribió (también si está suspendido, RN-15)
  createdAt: string; // ISO 8601
  mine: boolean; // lo escribió quien consulta (puede borrarlo); false para el invitado
}

export interface CommentsPageDto {
  comments: CommentDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PanelRef {
  slug: string;
  number: number;
  position: number;
}

// Campos explícitos: nunca sale de la API algo que no esté en el contrato (ni user_id ni el estado).
const toDto = (row: commentsRepository.CommentRow, user: User | null): CommentDto => ({
  id: row.id,
  body: row.body,
  authorName: row.authorName,
  createdAt: row.createdAt.toISOString(),
  mine: user !== null && row.userId === user.id,
});

// Obra y capítulo públicos (404, 410, como la lectura) y una viñeta que existe en ese capítulo (404).
async function requirePublicPanel(ref: PanelRef) {
  const { comic, chapter } = await requirePublicChapter(ref.slug, ref.number);
  const panelId = await chaptersRepository.findPanelId(pool, chapter.id, ref.position);
  if (panelId === null) throw new AppError(404, 'NOT_FOUND', 'La viñeta no existe');
  return { comic, chapter, panelId };
}

// CU-05: público (D1), también para el invitado. Del más antiguo al más reciente, 50 por página (D4).
export async function listComments(ref: PanelRef, page: number, user: User | null): Promise<CommentsPageDto> {
  const { panelId } = await requirePublicPanel(ref);
  const { total, comments } = await commentsRepository.listVisible(pool, panelId, {
    limit: COMMENTS_PAGE_SIZE,
    offset: (page - 1) * COMMENTS_PAGE_SIZE,
  });
  return { comments: comments.map((row) => toDto(row, user)), page, pageSize: COMMENTS_PAGE_SIZE, total };
}

// CU-13: comenta quien puede leer el capítulo sin gastar saldo (D2). La tabla de auditoría no tiene
// `comment.create`: el alta no se audita (confirmado al aprobar el contrato).
export async function createComment(ref: PanelRef, body: string, user: User): Promise<CommentDto> {
  const { comic, chapter, panelId } = await requirePublicPanel(ref);
  const alreadyRead = (await readingRepository.findReadChapterIds(pool, user.id, [chapter.id])).has(chapter.id);
  if (!canComment(user, { number: chapter.number, alreadyRead, ownsComic: comic.authorId === user.id }, new Date())) {
    throw new AppError(403, 'FORBIDDEN', 'Lee el capítulo antes de comentarlo');
  }
  return toDto(await commentsRepository.insert(pool, panelId, user.id, body), user);
}

// RN-11: su autor lo borra (borrado lógico). Orden del contrato: 404 (no existe u oculto: un oculto no lo ve
// nadie, tampoco su autor, D15), 403 (ajeno: no revela si se retiró), 410 (su obra o su capítulo se retiraron,
// RN-06: como el resto de lo retirado, sin cambios ni auditoría) y 409 (ya eliminado). Cambio y auditoría en la
// misma transacción.
export async function deleteOwnComment(id: number, user: User, ctx: RequestContext): Promise<void> {
  await withTransaction(async (client) => {
    const comment = await commentsRepository.findStateForUpdate(client, id);
    if (!comment || comment.hiddenAt) throw new AppError(404, 'NOT_FOUND', 'El comentario no existe');
    if (!canDeleteOwnComment(user, comment)) throw new AppError(403, 'FORBIDDEN', 'Solo puedes borrar tus comentarios');
    if (comment.withdrawn) throw new AppError(410, 'GONE', 'El capítulo o la obra del comentario se han retirado');
    if (comment.deletedAt) throw new AppError(409, 'CONFLICT', 'El comentario ya se eliminó');
    const deletedAt = await commentsRepository.markDeleted(client, id);
    await audit.record(client, {
      action: 'comment.delete_own',
      actorId: user.id,
      entityType: 'comments',
      entityId: String(id),
      before: { deletedAt: null },
      after: { deletedAt: deletedAt.toISOString() },
      ...ctx,
    });
  });
}

// --- Bloque 4: moderación (CU-33; RN-11; contrato del bloque 4) ---

export interface AdminCommentDto {
  id: number;
  body: string; // texto plano; el cliente lo pinta con textContent
  author: { id: number; displayName: string };
  createdAt: string; // ISO 8601
  hiddenAt: string | null;
  comic: { slug: string; title: string };
  chapterNumber: number;
  panelPosition: number;
}

export interface AdminCommentsPageDto {
  comments: AdminCommentDto[];
  page: number;
  pageSize: number;
  total: number;
}

export async function listForModeration(query: { q: string; status?: 'visible' | 'hidden' | undefined; page: number }): Promise<AdminCommentsPageDto> {
  const { total, comments } = await commentsRepository.listForModeration(pool, {
    q: escapeLike(query.q),
    status: query.status ?? null,
    limit: ADMIN_PAGE_SIZE,
    offset: (query.page - 1) * ADMIN_PAGE_SIZE,
  });
  return {
    comments: comments.map((row) => ({
      id: row.id,
      body: row.body,
      author: { id: row.authorId, displayName: row.authorName },
      createdAt: row.createdAt.toISOString(),
      hiddenAt: row.hiddenAt?.toISOString() ?? null,
      comic: row.comic,
      chapterNumber: row.chapterNumber,
      panelPosition: row.panelPosition,
    })),
    page: query.page,
    pageSize: ADMIN_PAGE_SIZE,
    total,
  };
}

// Ocultar (comment.hide) o eliminar (comment.delete). Orden del contrato: 404 (no existe), 410 (su obra o su capítulo
// se retiraron, RN-06), 409 (ya eliminado; al ocultar, también ya oculto). Eliminar vale también para uno oculto. Ni
// la auditoría ni el log llevan el texto. En el MVP no se deshace (la restauración es de fase 2).
export async function moderateComment(admin: User, id: number, action: 'hide' | 'delete', ctx: RequestContext): Promise<void> {
  await withTransaction(async (client) => {
    const comment = await commentsRepository.findStateForUpdate(client, id);
    if (!comment) throw new AppError(404, 'NOT_FOUND', 'El comentario no existe');
    if (comment.withdrawn) throw new AppError(410, 'GONE', 'El capítulo o la obra del comentario se han retirado');
    if (comment.deletedAt) throw new AppError(409, 'CONFLICT', 'El comentario ya se eliminó');
    const base = { actorId: admin.id, entityType: 'comments', entityId: String(id), ...ctx };
    if (action === 'hide') {
      if (comment.hiddenAt) throw new AppError(409, 'CONFLICT', 'El comentario ya está oculto');
      const hiddenAt = await commentsRepository.markHidden(client, id);
      await audit.record(client, { ...base, action: 'comment.hide', before: { hiddenAt: null }, after: { hiddenAt: hiddenAt.toISOString() } });
    } else {
      const deletedAt = await commentsRepository.markDeleted(client, id);
      await audit.record(client, { ...base, action: 'comment.delete', before: { deletedAt: null }, after: { deletedAt: deletedAt.toISOString() } });
    }
  });
}
