import { readFile, rm } from 'node:fs/promises';
import pg from 'pg';
import { AUTHOR_RECENT_COMMENTS, CATALOG_PAGE_SIZE, READS_WINDOW_LONG_DAYS, READS_WINDOW_SHORT_DAYS } from '../../config/limits.js';
import { pool, withTransaction, type Queryable } from '../../db/pool.js';
import { storage } from '../../integrations/storage/index.js';
import { AppError, INTERNAL_ERROR_MESSAGE } from '../../utils/app-error.js';
import * as audit from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { canManageComic, canPreviewComic, canWithdrawComic, chapterAccess, isAdmin, type ChapterAccess } from '../auth/permissions.js';
import * as chaptersRepository from '../chapters/chapters.repository.js';
import * as commentsRepository from '../comments/comments.repository.js';
import * as readingRepository from '../reading/reading.repository.js';
import { IMAGE_CONTENT_TYPES, newImageKey, readImageInfo } from '../../utils/image.js';
import { logger } from '../../utils/logger.js';
import * as usersRepository from '../users/users.repository.js';
import type { User } from '../users/users.repository.js';
import * as comicsRepository from './comics.repository.js';
import { abandonmentOf, groupWorkReads, LICENSES, licenseCodeFromName, nextFreeSlug, slugify, type AbandonmentDto, type LicenseCode, type Reads } from './comics.rules.js';
import type { CatalogQuery, CreateComicInput, UpdateComicInput } from './comics.schema.js';

// "Cómo se consigue" de /crear (become-author) para quien no es autor. Un admin nunca es autor (permissions.ts): a él
// no se le promete el estudio.
const BECOME_AUTHOR_USER =
  'El rol de autor lo activa un administrador de Koma en tu cuenta. No hay que rellenar nada aquí. Cuando lo tengas, «Crear» te llevará directamente a tu estudio.';
const BECOME_AUTHOR_ADMIN =
  'El rol de autor lo activa un administrador en una cuenta de usuario. Las cuentas de administrador no publican obras: para publicar, usa una cuenta de usuario con el rol de autor.';

export function becomeAuthorHowTo(user: User): string {
  return isAdmin(user) ? BECOME_AUTHOR_ADMIN : BECOME_AUTHOR_USER;
}

// Catálogo, etiquetas y ficha (CU-01, CU-02; contrato del bloque 2). Solo obras aprobadas y no retiradas;
// toda imagen sale con URL firmada (SIGNED_URL_TTL_SECONDS).

export interface TagDto {
  slug: string;
  name: string;
  type: 'genre' | 'theme';
}

export interface ComicCardDto {
  slug: string;
  title: string;
  authorCredit: string;
  coverUrl: string | null; // firmada; null si no tiene portada
  tags: TagDto[];
}

export interface CatalogPageDto {
  comics: ComicCardDto[];
  page: number;
  pageSize: number;
  total: number;
}

// Campos explícitos: nunca sale de la API algo que no esté en el contrato.
const toTagDto = (tag: comicsRepository.TagInput): TagDto => ({ slug: tag.slug, name: tag.name, type: tag.type });

async function toComicCardDto(row: comicsRepository.ComicCardRow): Promise<ComicCardDto> {
  return {
    slug: row.slug,
    title: row.title,
    authorCredit: row.authorCredit,
    coverUrl: row.coverKey ? await storage.signedUrl(row.coverKey) : null,
    tags: row.tags.map(toTagDto),
  };
}

export async function listTags(): Promise<TagDto[]> {
  return (await comicsRepository.listTags(pool)).map(toTagDto);
}

export async function searchCatalog(query: CatalogQuery): Promise<CatalogPageDto> {
  const { total, comics } = await comicsRepository.searchApprovedComics(pool, {
    q: query.q,
    tagSlugs: query.tags,
    limit: CATALOG_PAGE_SIZE,
    offset: (query.page - 1) * CATALOG_PAGE_SIZE,
  });
  return { comics: await Promise.all(comics.map(toComicCardDto)), page: query.page, pageSize: CATALOG_PAGE_SIZE, total };
}

// --- Ficha (CU-02) ---

export interface ChapterSummaryDto {
  number: number;
  title: string;
  status: 'draft' | 'pending' | 'approved'; // D10: draft y pending solo en la vista previa del dueño y del admin
  publishedAt: string | null; // ISO 8601; null si nunca se aprobó (vista previa)
  access: ChapterAccess; // qué exige leerlo a quien consulta (RN-01, RN-02); 'free' en draft y pending
  read: boolean; // ya leído por este usuario; false para el invitado
}

export interface ComicDto extends ComicCardDto {
  status: 'pending' | 'approved'; // D10: pending solo para el autor dueño y el admin
  synopsis: string;
  publishedBy: string | null; // null = "la plataforma" (obra importada, RN-07)
  license: string;
  licenseUrl: string | null;
  contentWarning: string | null; // RN-08
  chapters: ChapterSummaryDto[]; // por número
}

// La obra de esa URL si es pública: 404 si no existe o no está aprobada; 410 si se retiró (RN-06). Lo usan
// la ficha, el anuncio y la lectura, con el slug ya validado por comicParams. (El autor dueño y el admin
// verán las suyas en pending al llegar el bloque 3.)
export async function requirePublicComic(slug: string): Promise<comicsRepository.ComicRow> {
  const comic = await comicsRepository.findComicBySlug(pool, slug);
  if (!comic || comic.status !== 'approved') throw new AppError(404, 'NOT_FOUND', 'La obra no existe');
  if (comic.deletedAt) throw new AppError(410, 'GONE', 'La obra se ha retirado');
  return comic;
}

// Mapa de rutas (D10): la obra de esa URL para quien consulta. Pública si está aprobada; el autor dueño y el admin
// la ven también en pending (`preview`). 404 si no existe o no la puede ver (rechazada, o pending de otro); 410 si se
// retiró (RN-06). La usan la ficha y la lectura; el anuncio y los comentarios siguen con requirePublicComic.
export async function requireVisibleComic(slug: string, user: User | null): Promise<{ comic: comicsRepository.ComicRow; preview: boolean }> {
  const comic = await comicsRepository.findComicBySlug(pool, slug);
  const preview = comic !== null && canPreviewComic(user, comic);
  if (!comic || !(comic.status === 'approved' || (comic.status === 'pending' && preview))) {
    throw new AppError(404, 'NOT_FOUND', 'La obra no existe');
  }
  if (comic.deletedAt) throw new AppError(410, 'GONE', 'La obra se ha retirado');
  return { comic, preview };
}

export async function getComic(slug: string, user: User | null): Promise<ComicDto> {
  const { comic, preview } = await requireVisibleComic(slug, user);
  // D10: el dueño y el admin ven también los capítulos vivos en draft y pending; los demás, solo los aprobados.
  const chapters: chaptersRepository.VisibleChapterRow[] = preview
    ? await chaptersRepository.listLiveChapters(pool, comic.id)
    : (await chaptersRepository.listPublicChapters(pool, comic.id)).map((chapter) => ({ ...chapter, status: 'approved' as const }));
  const readIds = user ? await readingRepository.findReadChapterIds(pool, user.id, chapters.map((chapter) => chapter.id)) : new Set<number>();
  const ownsComic = user !== null && comic.authorId === user.id;
  const now = new Date();
  return {
    ...(await toComicCardDto(comic)),
    status: comic.status === 'approved' ? 'approved' : 'pending',
    synopsis: comic.synopsis,
    publishedBy: comic.publishedBy,
    license: comic.license,
    licenseUrl: comic.licenseUrl,
    contentWarning: comic.contentWarning,
    chapters: chapters.map((chapter) => {
      const read = readIds.has(chapter.id);
      return {
        number: chapter.number,
        title: chapter.title,
        status: chapter.status,
        publishedAt: chapter.publishedAt?.toISOString() ?? null,
        access: chapter.status === 'approved' ? chapterAccess(user, { number: chapter.number, alreadyRead: read, ownsComic }, now) : 'free',
        read,
      };
    }),
  };
}

// --- Obras del autor (CU-28, CU-30; contrato del bloque 3) ---

export interface AuthorChapterSummaryDto {
  number: number;
  title: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  panelCount: number;
  publishedAt: string | null; // ISO 8601; null si nunca se aprobó
}

export interface AuthorComicDto {
  slug: string;
  title: string;
  synopsis: string;
  authorCredit: string;
  license: LicenseCode;
  licenseUrl: string | null;
  tags: TagDto[];
  contentWarning: string | null;
  isAdult: boolean;
  coverUrl: string | null; // firmada
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null; // CU-28: se muestra el motivo
  createdAt: string; // ISO 8601
  chapters: AuthorChapterSummaryDto[]; // por número, sin los retirados; los rechazados, con su motivo
}

export const toAuthorChapterSummaryDto = (row: chaptersRepository.AuthorChapterSummaryRow): AuthorChapterSummaryDto => ({
  number: row.number,
  title: row.title,
  status: row.status,
  rejectionReason: row.rejectionReason,
  panelCount: row.panelCount,
  publishedAt: row.publishedAt?.toISOString() ?? null,
});

async function toAuthorComicDto(row: comicsRepository.AuthorComicRow, chapters: AuthorChapterSummaryDto[]): Promise<AuthorComicDto> {
  // Una obra de autor siempre lleva una licencia de la lista (D6): otra cosa es un fallo, no un dato del usuario.
  const license = licenseCodeFromName(row.license);
  if (!license) {
    throw new AppError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE, {
      cause: new Error(`La obra ${row.slug} tiene una licencia fuera de la lista: ${row.license}`),
    });
  }
  return {
    slug: row.slug,
    title: row.title,
    synopsis: row.synopsis,
    authorCredit: row.authorCredit,
    license,
    licenseUrl: row.licenseUrl,
    tags: row.tags.map(toTagDto),
    contentWarning: row.contentWarning,
    isAdult: row.isAdult,
    coverUrl: row.coverKey ? await storage.signedUrl(row.coverKey) : null,
    status: row.status,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
    chapters,
  };
}

// GET /api/author/comics: las obras del autor de la sesión, sin las retiradas, con el resumen de sus capítulos.
export async function listAuthorComics(user: User): Promise<AuthorComicDto[]> {
  const comics = await comicsRepository.listAuthorComics(pool, user.id);
  const chapters = await chaptersRepository.listAuthorChapterSummaries(pool, comics.map((comic) => comic.id));
  return Promise.all(
    comics.map((comic) =>
      toAuthorComicDto(
        comic,
        chapters.filter((chapter) => chapter.comicId === comic.id).map(toAuthorChapterSummaryDto),
      ),
    ),
  );
}

// --- Panel del autor (CU-31 recortado; RN-19; contrato del bloque 3, "Panel del autor") ---

export interface AuthorDashboardDto {
  displayName: string;
  authorSince: string;
  today: string;
  comics: { pending: number; approved: number; rejected: number };
  chapters: { draft: number; pending: number; approved: number; rejected: number };
  reads: Reads;
  works: {
    slug: string;
    title: string;
    status: 'pending' | 'approved' | 'rejected';
    reads: Reads;
    chapters: { number: number; title: string; reads: Reads; abandonment: AbandonmentDto }[]; // abandonment: RN-21 (bloque 5)
  }[];
  recentComments: {
    id: number;
    body: string;
    authorName: string;
    createdAt: string;
    comic: { slug: string; title: string };
    chapterNumber: number;
    panelPosition: number;
  }[];
}

// GET /api/author/dashboard: solo lo del usuario de la sesión (requireAuthor va antes en la ruta). Solo lectura.
export async function getAuthorDashboard(user: User): Promise<AuthorDashboardDto> {
  const [createdAt, counts, readRows, comments, abandonmentRows] = await Promise.all([
    usersRepository.findCreatedAt(pool, user.id),
    comicsRepository.countAuthorStatuses(pool, user.id),
    comicsRepository.listAuthorChapterReads(pool, user.id, { shortDays: READS_WINDOW_SHORT_DAYS, longDays: READS_WINDOW_LONG_DAYS }),
    commentsRepository.listRecentOnAuthorComics(pool, user.id, AUTHOR_RECENT_COMMENTS),
    comicsRepository.listAuthorAbandonment(pool, user.id),
  ]);
  // RN-21: el abandono de cada capítulo, por obra y número (las mismas filas que las lecturas: approved y vivos).
  const abandonment = new Map(abandonmentRows.map((row) => [`${row.comicId}:${row.chapterNumber}`, abandonmentOf(row.panels, row.distribution)]));
  // El usuario se acaba de leer de la BD (auth): si ya no está, la sesión no vale.
  if (!createdAt) throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar');
  const toReads = (r: comicsRepository.ReadCounts): Reads => ({ total: r.total, last7: r.lastShort, last30: r.lastLong });
  const { reads, works } = groupWorkReads(
    readRows.map((row) => ({
      comic: { id: row.comicId, slug: row.slug, title: row.title, status: row.status },
      chapter: row.chapterNumber === null ? null : { number: row.chapterNumber, title: row.chapterTitle ?? '', reads: toReads(row.reads) },
    })),
  );
  return {
    displayName: user.displayName,
    authorSince: createdAt.toISOString(),
    today: counts.today,
    comics: counts.comics,
    chapters: counts.chapters,
    reads,
    works: works.map((work) => ({
      slug: work.comic.slug,
      title: work.comic.title,
      status: work.comic.status,
      reads: work.reads,
      chapters: work.chapters.map((chapter) => ({
        ...chapter,
        abandonment: abandonment.get(`${work.comic.id}:${chapter.number}`) ?? abandonmentOf(0, []),
      })),
    })),
    recentComments: comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      authorName: comment.authorName,
      createdAt: comment.createdAt.toISOString(),
      comic: { slug: comment.comicSlug, title: comment.comicTitle },
      chapterNumber: comment.chapterNumber,
      panelPosition: comment.panelPosition,
    })),
  };
}

// D5: las etiquetas deben existir todas y al menos una ser un género (si no, 400 en fields.tags). Alta y edición.
async function assertTags(db: Queryable, slugs: readonly string[]): Promise<void> {
  const tags = await comicsRepository.findTagsBySlugs(db, slugs);
  if (tags.length !== slugs.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Revisa los datos enviados', { fields: { tags: 'Alguna etiqueta no existe' } });
  }
  if (!tags.some((tag) => tag.type === 'genre')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Revisa los datos enviados', { fields: { tags: 'Elige al menos un género' } });
  }
}

// Dos altas a la vez con el mismo slug: la segunda choca con el UNIQUE de comics.slug (23505) y se reintenta.
const SLUG_RETRIES = 3;
const isSlugTaken = (err: unknown) => err instanceof pg.DatabaseError && err.code === '23505' && err.constraint === 'comics_slug_key';

// CU-28 · RN-05, RN-07, RN-09, RN-17. Nace `pending`, del usuario y con la declaración de autoría. Las etiquetas
// deben existir todas y al menos una ser un género (si no, 400 en fields.tags). `isAdult: true` se guarda, pero
// no se podrá aprobar (CHECK comics_adult_not_approved). El alta y su auditoría van en la misma transacción.
export async function createComic(user: User, input: CreateComicInput, ctx: RequestContext): Promise<AuthorComicDto> {
  const license = LICENSES[input.license];
  const base = slugify(input.title);
  for (let attempt = 1; ; attempt++) {
    try {
      const comicId = await withTransaction(async (client) => {
        await assertTags(client, input.tags);
        const slug = nextFreeSlug(base, await comicsRepository.findSlugsLike(client, base));
        const id = await comicsRepository.insertComic(client, {
          slug,
          title: input.title,
          synopsis: input.synopsis,
          authorId: user.id,
          authorCredit: input.authorCredit,
          license: license.name,
          licenseUrl: license.url,
          isAdult: input.isAdult,
          contentWarning: input.contentWarning,
          coverKey: null,
          status: 'pending',
          authorshipDeclared: input.authorshipDeclared,
        });
        await comicsRepository.addComicTags(client, id, input.tags);
        await audit.record(client, {
          action: 'comic.create',
          actorId: user.id,
          entityType: 'comics',
          entityId: String(id),
          after: {
            slug,
            title: input.title,
            status: 'pending',
            isAdult: input.isAdult,
            license: input.license,
            tags: [...input.tags].sort(),
          },
          ...ctx,
        });
        return id;
      });
      const comic = (await comicsRepository.findAuthorComicById(pool, comicId))!;
      return toAuthorComicDto(comic, []);
    } catch (err) {
      if (isSlugTaken(err) && attempt < SLUG_RETRIES) continue;
      throw err;
    }
  }
}

// --- Comprobaciones comunes del autor (contrato del bloque 3, "Comunes a todo el bloque") ---

export interface ManageOptions {
  lock?: boolean; // FOR UPDATE hasta el final de la transacción
  editable?: boolean; // D8: una obra rechazada es definitiva (capítulos, portada y edición → 409)
}

// La obra de ese slug si la gestiona `user`: 404 si no existe, 403 si es ajena (CU-29, "la obra no le
// pertenece"), 410 si se retiró y, con `editable`, 409 si se rechazó.
export async function requireManagedComic(db: Queryable, slug: string, user: User, options: ManageOptions = {}): Promise<comicsRepository.ComicState> {
  const comic = await comicsRepository.findComicState(db, slug, options.lock);
  if (!comic) throw new AppError(404, 'NOT_FOUND', 'La obra no existe');
  if (!canManageComic(user, comic)) throw new AppError(403, 'FORBIDDEN', 'La obra no te pertenece');
  if (comic.deletedAt) throw new AppError(410, 'GONE', 'La obra se ha retirado');
  if (options.editable && comic.status === 'rejected') {
    throw new AppError(409, 'CONFLICT', 'La obra fue rechazada y ya no admite cambios');
  }
  return comic;
}

// Archivo que deja multer en el temporal (middlewares/upload.ts).
export interface UploadedFile {
  path: string;
}

export interface StoredImage {
  key: string;
  width: number;
  height: number;
}

// RN-10: sin archivo, 400 en fields.image; la firma de la cabecera debe ser JPEG, PNG o WebP (si no, 415) y de ella
// salen el ancho, el alto y la extensión de la clave UUID.ext. Se lee entero (5 MB como mucho, ya limitado por
// multer), como en la importación: el SOF de un JPEG puede ir detrás de metadatos largos. El temporal no se borra
// aquí: lo borra withUpload.
async function storeImage(file: UploadedFile | undefined): Promise<StoredImage> {
  if (!file) throw new AppError(400, 'VALIDATION_ERROR', 'Revisa los datos enviados', { fields: { image: 'Elige una imagen' } });
  const info = readImageInfo(await readFile(file.path));
  if (!info) throw new AppError(415, 'UNSUPPORTED_FILE', 'La imagen debe ser JPEG, PNG o WebP');
  const key = newImageKey(info.type);
  await storage.put(key, file.path, IMAGE_CONTENT_TYPES[info.type]);
  return { key, width: info.width, height: info.height };
}

// Borra del almacenamiento una imagen que ya no se usa, después del COMMIT. Si falla, solo queda un aviso en el
// log (la imagen queda huérfana): la operación ya se hizo.
export async function removeStoredImage(key: string, requestId: string, reason: string): Promise<void> {
  try {
    await storage.remove(key);
  } catch (err) {
    logger.warn('No se pudo borrar una imagen del almacenamiento', { requestId, key, reason, err });
  }
}

// Guarda la imagen subida y ejecuta `use` con ella. El temporal de multer se borra siempre (`finally`). Si `use`
// falla, la imagen recién guardada se intenta borrar (si tampoco se puede, queda huérfana: riesgo aceptado).
export async function withUpload<T>(file: UploadedFile | undefined, requestId: string, use: (image: StoredImage) => Promise<T>): Promise<T> {
  try {
    const image = await storeImage(file);
    try {
      return await use(image);
    } catch (err) {
      await removeStoredImage(image.key, requestId, 'la operación de la subida falló');
      throw err;
    }
  } finally {
    if (file) await rm(file.path, { force: true });
  }
}

async function authorComicDto(slug: string): Promise<AuthorComicDto> {
  const comic = (await comicsRepository.findAuthorComicBySlug(pool, slug))!;
  const chapters = await chaptersRepository.listAuthorChapterSummaries(pool, [comic.id]);
  return toAuthorComicDto(comic, chapters.map(toAuthorChapterSummaryDto));
}

// PUT /api/author/comics/:slug/cover (D7). La clave es nueva y la anterior se borra después del COMMIT. Se audita
// como comic.update con la clave de antes y la de después.
export async function updateCover(user: User, slug: string, file: UploadedFile | undefined, ctx: RequestContext): Promise<AuthorComicDto> {
  const previous = await withUpload(file, ctx.requestId, (image) =>
    withTransaction(async (client) => {
      const comic = await requireManagedComic(client, slug, user, { lock: true, editable: true });
      await comicsRepository.updateCoverKey(client, comic.id, image.key);
      await audit.record(client, {
        action: 'comic.update',
        actorId: user.id,
        entityType: 'comics',
        entityId: String(comic.id),
        before: { coverKey: comic.coverKey },
        after: { coverKey: image.key },
        ...ctx,
      });
      return comic.coverKey;
    }),
  );
  if (previous) await removeStoredImage(previous, ctx.requestId, 'portada sustituida');
  return authorComicDto(slug);
}

// POST /api/comics/:slug/withdraw (CU-30, RN-06, D13): la retira su autor o, cualquiera (también una importada), el
// admin. Orden: 404 (no existe), 403 (ni dueño ni admin), 409 (ya retirada). La ficha, el lector y la API pública
// responden 410 y sus comentarios quedan ocultos con ella.
export async function withdrawComic(user: User, slug: string, ctx: RequestContext): Promise<void> {
  await withTransaction(async (client) => {
    const comic = await comicsRepository.findComicState(client, slug, true);
    if (!comic) throw new AppError(404, 'NOT_FOUND', 'La obra no existe');
    if (!canWithdrawComic(user, comic)) throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para retirar esta obra');
    if (comic.deletedAt) throw new AppError(409, 'CONFLICT', 'La obra ya está retirada');
    const deletedAt = await comicsRepository.withdrawComic(client, comic.id);
    await audit.record(client, {
      action: 'comic.withdraw',
      actorId: user.id,
      entityType: 'comics',
      entityId: String(comic.id),
      before: { deletedAt: null },
      after: { deletedAt: deletedAt.toISOString() },
      ...ctx,
    });
  });
}

// PATCH /api/author/comics/:slug (CU-30, recortable): sin reaprobación (RN-05) y sin cambiar el slug (RN-09). Solo se
// guarda y se audita lo que cambia (comic.update con esos campos antes y después; sin cambios, ni escribe ni audita).
// `isAdult` solo cambia mientras la obra no está aprobada (D14); una rechazada no se edita (409, D8).
export async function updateComic(user: User, slug: string, input: UpdateComicInput, ctx: RequestContext): Promise<AuthorComicDto> {
  await withTransaction(async (client) => {
    const state = await requireManagedComic(client, slug, user, { lock: true, editable: true });
    const current = (await comicsRepository.findAuthorComicById(client, state.id))!;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const fields: comicsRepository.ComicFieldsUpdate = {};
    const change = <K extends 'title' | 'synopsis' | 'authorCredit' | 'contentWarning' | 'isAdult'>(key: K, value: comicsRepository.ComicFieldsUpdate[K] | undefined, old: comicsRepository.ComicFieldsUpdate[K]) => {
      if (value === undefined || value === old) return;
      before[key] = old;
      after[key] = value;
      fields[key] = value;
    };

    change('title', input.title, current.title);
    change('synopsis', input.synopsis, current.synopsis);
    change('authorCredit', input.authorCredit, current.authorCredit);
    change('contentWarning', input.contentWarning, current.contentWarning);
    if (input.isAdult !== undefined && input.isAdult !== current.isAdult && current.status === 'approved') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Revisa los datos enviados', {
        fields: { isAdult: 'No se puede cambiar en una obra ya publicada' },
      });
    }
    change('isAdult', input.isAdult, current.isAdult);

    const currentLicense = licenseCodeFromName(current.license);
    if (input.license !== undefined && input.license !== currentLicense) {
      before['license'] = currentLicense;
      after['license'] = input.license;
      fields.license = LICENSES[input.license].name;
      fields.licenseUrl = LICENSES[input.license].url;
    }

    const currentTags = current.tags.map((tag) => tag.slug).sort();
    const nextTags = input.tags ? [...input.tags].sort() : undefined;
    const tagsChanged = nextTags !== undefined && nextTags.join(',') !== currentTags.join(',');
    if (nextTags) await assertTags(client, nextTags);
    if (tagsChanged) {
      before['tags'] = currentTags;
      after['tags'] = nextTags;
    }

    if (Object.keys(after).length === 0) return;
    await comicsRepository.updateComicFields(client, state.id, fields);
    if (tagsChanged) await comicsRepository.replaceComicTags(client, state.id, nextTags);
    await audit.record(client, {
      action: 'comic.update',
      actorId: user.id,
      entityType: 'comics',
      entityId: String(state.id),
      before,
      after,
      ...ctx,
    });
  });
  return authorComicDto(slug);
}
