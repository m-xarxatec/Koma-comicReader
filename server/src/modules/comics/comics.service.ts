import { CATALOG_PAGE_SIZE } from '../../config/limits.js';
import { pool } from '../../db/pool.js';
import { storage } from '../../integrations/storage/index.js';
import * as comicsRepository from './comics.repository.js';
import type { CatalogQuery } from './comics.schema.js';

// Catálogo y etiquetas (CU-01; contrato del bloque 2). Solo obras aprobadas y no retiradas; toda imagen
// sale con URL firmada (SIGNED_URL_TTL_SECONDS).

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
