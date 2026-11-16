import { ADMIN_PAGE_SIZE, ILLUSTRATION_PENDING_MAX, ILLUSTRATION_TOP_TAGS, ILLUSTRATIONS_PAGE_SIZE } from '../../config/limits.js';
import { pool, withTransaction, type Queryable } from '../../db/pool.js';
import { storage } from '../../integrations/storage/index.js';
import { AppError } from '../../utils/app-error.js';
import * as audit from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { canPublishIllustration, canWithdrawIllustration } from '../auth/permissions.js';
import { withUpload, type UploadedFile } from '../comics/comics.service.js';
import type { User } from '../users/users.repository.js';
import * as illustrationsRepository from './illustrations.repository.js';
import type { IllustrationRow } from './illustrations.repository.js';
import type { IllustrationInput } from './illustrations.schema.js';

// Ilustraciones de la comunidad (CU-18 sin reto, CU-32; RN-22; contrato del bloque 6). Reglas y propiedad; el SQL
// vive en el repositorio. La clave de la imagen nunca sale de aquí: solo su URL firmada.

export interface IllustrationDto {
  id: number;
  title: string;
  description: string | null;
  url: string; // firmada
  width: number;
  height: number;
  tags: string[];
  author: { displayName: string };
  publishedAt: string;
}

export interface OwnIllustrationDto extends Omit<IllustrationDto, 'publishedAt'> {
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface AdminIllustrationDto extends Omit<OwnIllustrationDto, 'author'> {
  author: { id: number; displayName: string };
}

export interface TagCountDto {
  tag: string;
  count: number;
}

interface Paged {
  page: number;
  pageSize: number;
  total: number;
}

async function baseDto(row: IllustrationRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    url: await storage.signedUrl(row.imageKey),
    width: row.width,
    height: row.height,
    tags: row.tags,
  };
}

// Solo para las públicas: una aprobada siempre tiene published_at (CHECK illustrations_published).
async function toPublicDto(row: IllustrationRow): Promise<IllustrationDto> {
  return { ...(await baseDto(row)), author: { displayName: row.authorName }, publishedAt: row.publishedAt!.toISOString() };
}

const reviewFields = (row: IllustrationRow) => ({
  status: row.status,
  rejectionReason: row.rejectionReason,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

async function toOwnDto(row: IllustrationRow): Promise<OwnIllustrationDto> {
  return { ...(await baseDto(row)), author: { displayName: row.authorName }, ...reviewFields(row) };
}

async function toAdminDto(row: IllustrationRow): Promise<AdminIllustrationDto> {
  return { ...(await baseDto(row)), author: { id: row.userId, displayName: row.authorName }, ...reviewFields(row) };
}

const pageOf = (page: number, pageSize: number) => ({ limit: pageSize, offset: (page - 1) * pageSize });

// GET /api/illustrations: el tablero público, con las etiquetas más usadas.
export async function listBoard(query: { tag?: string | undefined; page: number }): Promise<{ illustrations: IllustrationDto[]; tags: TagCountDto[] } & Paged> {
  const [list, tags] = await Promise.all([
    illustrationsRepository.listPublic(pool, query.tag ?? null, pageOf(query.page, ILLUSTRATIONS_PAGE_SIZE)),
    illustrationsRepository.listTopTags(pool, ILLUSTRATION_TOP_TAGS),
  ]);
  return {
    illustrations: await Promise.all(list.illustrations.map(toPublicDto)),
    tags,
    page: query.page,
    pageSize: ILLUSTRATIONS_PAGE_SIZE,
    total: list.total,
  };
}

// GET /api/me/illustrations (D7).
export async function listOwn(user: User, page: number): Promise<{ illustrations: OwnIllustrationDto[] } & Paged> {
  const list = await illustrationsRepository.listOwn(pool, user.id, pageOf(page, ILLUSTRATIONS_PAGE_SIZE));
  return { illustrations: await Promise.all(list.illustrations.map(toOwnDto)), page, pageSize: ILLUSTRATIONS_PAGE_SIZE, total: list.total };
}

// GET /api/admin/illustrations (D9).
export async function listForAdmin(status: 'pending' | 'approved', page: number): Promise<{ illustrations: AdminIllustrationDto[] } & Paged> {
  const list = await illustrationsRepository.listForAdmin(pool, status, pageOf(page, ADMIN_PAGE_SIZE));
  return { illustrations: await Promise.all(list.illustrations.map(toAdminDto)), page, pageSize: ADMIN_PAGE_SIZE, total: list.total };
}

// RN-22 (D4, D5): quién publica (403) y el tope de pendientes (409). Se llama antes de multer, para no escribir nada
// en disco, y otra vez dentro de la transacción del alta con la fila del usuario bloqueada.
export async function requirePublisher(db: Queryable, user: User): Promise<void> {
  if (!canPublishIllustration(user)) throw new AppError(403, 'FORBIDDEN', 'Un administrador no publica ilustraciones');
  if ((await illustrationsRepository.countPending(db, user.id)) >= ILLUSTRATION_PENDING_MAX) {
    throw new AppError(409, 'CONFLICT', `Ya tienes ${ILLUSTRATION_PENDING_MAX} ilustraciones pendientes de revisión. Espera a que se revisen o retira alguna.`);
  }
}

// POST /api/illustrations: guarda la imagen (RN-10: 400 sin archivo, 415 por la firma) y crea la ilustración en
// `pending`. En la auditoría van el título y las etiquetas, nunca la clave de la imagen.
export async function publish(user: User, input: IllustrationInput, file: UploadedFile | undefined, ctx: RequestContext): Promise<OwnIllustrationDto> {
  const id = await withUpload(file, ctx.requestId, (image) =>
    withTransaction(async (client) => {
      await illustrationsRepository.lockUser(client, user.id);
      await requirePublisher(client, user);
      const created = await illustrationsRepository.insert(client, {
        userId: user.id,
        title: input.title,
        description: input.description,
        imageKey: image.key,
        width: image.width,
        height: image.height,
        tags: input.tags,
      });
      await audit.record(client, {
        action: 'illustration.create',
        actorId: user.id,
        entityType: 'illustrations',
        entityId: String(created),
        after: { title: input.title, tags: [...input.tags].sort() },
        ...ctx,
      });
      return created;
    }),
  );
  return toOwnDto((await illustrationsRepository.findById(pool, id))!);
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'La ilustración no existe');

// POST /api/illustrations/:id/withdraw: la retira su dueño o el admin, desde cualquier estado. Orden: 404 (no
// existe), 403 (ni dueño ni admin), 409 (ya retirada). Borrado lógico: la imagen se queda en el almacenamiento.
export async function withdraw(user: User, id: number, ctx: RequestContext): Promise<void> {
  await withTransaction(async (client) => {
    const illustration = await illustrationsRepository.findStateForUpdate(client, id);
    if (!illustration) throw notFound();
    if (!canWithdrawIllustration(user, illustration)) throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para retirar esta ilustración');
    if (illustration.deletedAt) throw new AppError(409, 'CONFLICT', 'La ilustración ya está retirada');
    const deletedAt = await illustrationsRepository.withdraw(client, illustration.id);
    await audit.record(client, {
      action: 'illustration.withdraw',
      actorId: user.id,
      entityType: 'illustrations',
      entityId: String(illustration.id),
      before: { deletedAt: null },
      after: { deletedAt: deletedAt.toISOString() },
      ...ctx,
    });
  });
}

export type Review = { decision: 'approve' } | { decision: 'reject'; reason: string };

// POST /api/admin/illustrations/:id/approve y /reject (CU-32): solo una `pending` y no retirada (si no, 409).
// Aprobar fija published_at; rechazar exige motivo, que verá su dueño.
export async function review(admin: User, id: number, decision: Review, ctx: RequestContext): Promise<void> {
  await withTransaction(async (client) => {
    const illustration = await illustrationsRepository.findStateForUpdate(client, id);
    if (!illustration) throw notFound();
    if (illustration.deletedAt) throw new AppError(409, 'CONFLICT', 'La ilustración se ha retirado');
    if (illustration.status !== 'pending') throw new AppError(409, 'CONFLICT', 'La ilustración ya se revisó');
    const base = { actorId: admin.id, entityType: 'illustrations' as const, entityId: String(illustration.id), ...ctx };
    if (decision.decision === 'approve') {
      const publishedAt = await illustrationsRepository.approve(client, illustration.id);
      await audit.record(client, {
        ...base,
        action: 'illustration.approve',
        before: { status: 'pending', publishedAt: null },
        after: { status: 'approved', publishedAt: publishedAt.toISOString() },
      });
    } else {
      await illustrationsRepository.reject(client, illustration.id, decision.reason);
      await audit.record(client, {
        ...base,
        action: 'illustration.reject',
        before: { status: 'pending', rejectionReason: null },
        after: { status: 'rejected', rejectionReason: decision.reason },
      });
    }
  });
}
