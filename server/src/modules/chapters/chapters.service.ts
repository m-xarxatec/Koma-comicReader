import pg from 'pg';
import { MAX_PANELS_PER_CHAPTER } from '../../config/limits.js';
import { pool, withTransaction, type Queryable } from '../../db/pool.js';
import { storage } from '../../integrations/storage/index.js';
import { AppError } from '../../utils/app-error.js';
import * as audit from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import * as comicsService from '../comics/comics.service.js';
import type { User } from '../users/users.repository.js';
import * as chaptersRepository from './chapters.repository.js';
import type { CreateChapterInput } from './chapters.schema.js';

// Capítulos y viñetas del autor (CU-29, CU-30; RN-05, RN-09, RN-10; contrato del bloque 3). Toda ruta con :number
// actúa sobre el capítulo vivo de ese número. El orden de los errores es: obra (404, 403, 410, 409 si se rechazó),
// capítulo (404), estado (409 si no es borrador) y, después, los de cada operación.

export interface AuthorPanelDto {
  position: number;
  url: string; // firmada
  width: number; // px, leídos de la cabecera del archivo
  height: number;
}

export interface AuthorChapterDto extends comicsService.AuthorChapterSummaryDto {
  panels: AuthorPanelDto[]; // por posición
}

const toPanelDto = async (panel: chaptersRepository.PanelRow): Promise<AuthorPanelDto> => ({
  position: panel.position,
  url: await storage.signedUrl(panel.imageKey),
  width: panel.width,
  height: panel.height,
});

async function toChapterDto(chapterId: number): Promise<AuthorChapterDto> {
  const chapter = (await chaptersRepository.findChapterSummaryById(pool, chapterId))!;
  const panels = await chaptersRepository.listPanels(pool, chapterId);
  return { ...comicsService.toAuthorChapterSummaryDto(chapter), panels: await Promise.all(panels.map(toPanelDto)) };
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'El capítulo no existe');
const notDraft = () => new AppError(409, 'CONFLICT', 'El capítulo ya se envió a revisión: no se puede editar');

interface ChapterRef {
  slug: string;
  number: number;
}

// Obra gestionable y su capítulo vivo; con `draft`, solo si es un borrador.
async function requireChapter(db: Queryable, ref: ChapterRef, user: User, options: { lock?: boolean; draft?: boolean; editable?: boolean } = {}) {
  const comic = await comicsService.requireManagedComic(db, ref.slug, user, { editable: options.editable ?? true });
  const chapter = await chaptersRepository.findLiveChapter(db, comic.id, ref.number, options.lock);
  if (!chapter) throw notFound();
  if (options.draft && chapter.status !== 'draft') throw notDraft();
  return { comic, chapter };
}

const isNumberTaken = (err: unknown) =>
  err instanceof pg.DatabaseError && err.code === '23505' && err.constraint === 'chapters_comic_number_uq';

// CU-29 (D21, D22, D8). Nace `draft`. Se admite en una obra pending o approved; en una rechazada, 409. El número de
// un retirado o rechazado se reutiliza (RN-09); el de un capítulo vivo da 409.
export async function createChapter(user: User, slug: string, input: CreateChapterInput, ctx: RequestContext): Promise<AuthorChapterDto> {
  const title = input.title ?? `Capítulo ${input.number}`;
  const chapterId = await withTransaction(async (client) => {
    const comic = await comicsService.requireManagedComic(client, slug, user, { lock: true, editable: true });
    let id: number;
    try {
      id = await chaptersRepository.insertDraftChapter(client, comic.id, input.number, title);
    } catch (err) {
      if (isNumberTaken(err)) throw new AppError(409, 'CONFLICT', 'El número de capítulo ya está en uso', { cause: err });
      throw err;
    }
    await audit.record(client, {
      action: 'chapter.create',
      actorId: user.id,
      entityType: 'chapters',
      entityId: String(id),
      after: { comic: slug, number: input.number, title, status: 'draft' },
      ...ctx,
    });
    return id;
  });
  return toChapterDto(chapterId);
}

// GET: también de una obra rechazada (el autor ve el motivo y sus capítulos).
export async function getChapter(user: User, ref: ChapterRef): Promise<AuthorChapterDto> {
  const { chapter } = await requireChapter(pool, ref, user, { editable: false });
  return toChapterDto(chapter.id);
}

// Comprobación previa a multer (chapters.routes.ts): sin obra gestionable, capítulo vivo en borrador y hueco para
// otra viñeta, no se escribe nada en disco. El servicio lo repite con el capítulo bloqueado.
export async function checkPanelUpload(user: User, ref: ChapterRef): Promise<void> {
  const { chapter } = await requireChapter(pool, ref, user, { draft: true });
  await assertRoomForPanel(pool, chapter.id);
}

async function assertRoomForPanel(db: Queryable, chapterId: number): Promise<void> {
  if ((await chaptersRepository.countPanels(db, chapterId)) >= MAX_PANELS_PER_CHAPTER) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Revisa los datos enviados', {
      fields: { image: `Un capítulo admite como mucho ${MAX_PANELS_PER_CHAPTER} viñetas` },
    });
  }
}

// RN-10, RN-13. Una imagen por petición; va al final (max + 1) con el capítulo bloqueado. Sin auditoría: el borrador
// nunca fue público. Si la transacción falla después de `put`, withUpload intenta borrar la imagen.
export async function uploadPanel(user: User, ref: ChapterRef, file: comicsService.UploadedFile | undefined, ctx: RequestContext): Promise<AuthorPanelDto> {
  const panel = await comicsService.withUpload(file, ctx.requestId, (image) =>
    withTransaction(async (client) => {
      const { chapter } = await requireChapter(client, ref, user, { lock: true, draft: true });
      await assertRoomForPanel(client, chapter.id);
      const position = await chaptersRepository.appendPanel(client, chapter.id, { imageKey: image.key, width: image.width, height: image.height });
      return { position, imageKey: image.key, width: image.width, height: image.height };
    }),
  );
  return toPanelDto(panel);
}

// RN-05: solo en draft. Borrado físico y recompactación; la imagen se borra del almacenamiento después del COMMIT.
export async function deletePanel(user: User, ref: ChapterRef, position: number, ctx: RequestContext): Promise<void> {
  const imageKey = await withTransaction(async (client) => {
    const { chapter } = await requireChapter(client, ref, user, { lock: true, draft: true });
    const panel = await chaptersRepository.findPanelAt(client, chapter.id, position);
    if (!panel) throw new AppError(404, 'NOT_FOUND', 'La viñeta no existe');
    await chaptersRepository.deletePanelAndCompact(client, chapter.id, panel.id, position);
    return panel.imageKey;
  });
  await comicsService.removeStoredImage(imageKey, ctx.requestId, 'viñeta eliminada de un borrador');
}

// RN-05 (D9): solo en draft. Mueve la viñeta y desplaza las intermedias. La misma posición responde sin cambios;
// una posición nueva fuera de 1…n, 400 en fields.position.
export async function movePanel(user: User, ref: ChapterRef, from: number, to: number): Promise<AuthorChapterDto> {
  const chapterId = await withTransaction(async (client) => {
    const { chapter } = await requireChapter(client, ref, user, { lock: true, draft: true });
    if (!(await chaptersRepository.findPanelAt(client, chapter.id, from))) throw new AppError(404, 'NOT_FOUND', 'La viñeta no existe');
    const count = await chaptersRepository.countPanels(client, chapter.id);
    if (to > count) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Revisa los datos enviados', {
        fields: { position: `La posición debe estar entre 1 y ${count}` },
      });
    }
    if (to !== from) await chaptersRepository.movePanel(client, chapter.id, from, to);
    return chapter.id;
  });
  return toChapterDto(chapterId);
}

// RN-05: de draft, con al menos una viñeta, a pending. Desde pending ya no se edita.
export async function submitChapter(user: User, ref: ChapterRef, ctx: RequestContext): Promise<AuthorChapterDto> {
  const chapterId = await withTransaction(async (client) => {
    const { chapter } = await requireChapter(client, ref, user, { lock: true, draft: true });
    if ((await chaptersRepository.countPanels(client, chapter.id)) === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Añade al menos una viñeta antes de enviarlo a revisión');
    }
    await chaptersRepository.submitChapter(client, chapter.id);
    await audit.record(client, {
      action: 'chapter.submit',
      actorId: user.id,
      entityType: 'chapters',
      entityId: String(chapter.id),
      before: { status: 'draft' },
      after: { status: 'pending' },
      ...ctx,
    });
    return chapter.id;
  });
  return toChapterDto(chapterId);
}

// CU-30: desde draft, pending o approved (también en una obra rechazada: retirar no es editar). Si estaba aprobado,
// el lector responde 410 y deja de salir en la ficha; el número queda libre.
export async function withdrawChapter(user: User, ref: ChapterRef, ctx: RequestContext): Promise<void> {
  await withTransaction(async (client) => {
    const { chapter } = await requireChapter(client, ref, user, { lock: true, editable: false });
    const deletedAt = await chaptersRepository.withdrawChapter(client, chapter.id);
    await audit.record(client, {
      action: 'chapter.withdraw',
      actorId: user.id,
      entityType: 'chapters',
      entityId: String(chapter.id),
      before: { deletedAt: null },
      after: { deletedAt: deletedAt.toISOString() },
      ...ctx,
    });
  });
}
