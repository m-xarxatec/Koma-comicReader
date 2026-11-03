import { CATALOG_PAGE_SIZE } from '../../config/limits.js';
import { pool } from '../../db/pool.js';
import { storage } from '../../integrations/storage/index.js';
import { AppError } from '../../utils/app-error.js';
import { chapterAccess, type ChapterAccess } from '../auth/permissions.js';
import * as chaptersRepository from '../chapters/chapters.repository.js';
import * as readingRepository from '../reading/reading.repository.js';
import type { User } from '../users/users.repository.js';
import * as comicsRepository from './comics.repository.js';
import { SLUG_PATTERN, type CatalogQuery } from './comics.schema.js';

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
  publishedAt: string; // ISO 8601
  access: ChapterAccess; // qué exige leerlo a quien consulta (RN-01, RN-02)
  read: boolean; // ya leído por este usuario; false para el invitado
}

export interface ComicDto extends ComicCardDto {
  synopsis: string;
  publishedBy: string | null; // null = "la plataforma" (obra importada, RN-07)
  license: string;
  licenseUrl: string | null;
  contentWarning: string | null; // RN-08
  chapters: ChapterSummaryDto[]; // por número
}

// La obra de esa URL si es pública: 404 si no existe o no está aprobada (también un slug que no puede
// existir, antes de consultar la BD); 410 si se retiró (RN-06). Lo usan la ficha, el anuncio y la lectura.
// (El autor dueño y el admin verán las suyas en pending al llegar el bloque 3.)
export async function requirePublicComic(slug: string): Promise<comicsRepository.ComicRow> {
  const comic = SLUG_PATTERN.test(slug) ? await comicsRepository.findComicBySlug(pool, slug) : null;
  if (!comic || comic.status !== 'approved') throw new AppError(404, 'NOT_FOUND', 'La obra no existe');
  if (comic.deletedAt) throw new AppError(410, 'GONE', 'La obra se ha retirado');
  return comic;
}

export async function getComic(slug: string, user: User | null): Promise<ComicDto> {
  const comic = await requirePublicComic(slug);
  const chapters = await chaptersRepository.listPublicChapters(pool, comic.id);
  const readIds = user ? await readingRepository.findReadChapterIds(pool, user.id, chapters.map((chapter) => chapter.id)) : new Set<number>();
  const ownsComic = user !== null && comic.authorId === user.id;
  const now = new Date();
  return {
    ...(await toComicCardDto(comic)),
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
        publishedAt: chapter.publishedAt.toISOString(),
        access: chapterAccess(user, { number: chapter.number, alreadyRead: read, ownsComic }, now),
        read,
      };
    }),
  };
}
