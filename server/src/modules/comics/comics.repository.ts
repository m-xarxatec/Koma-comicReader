import type { Queryable } from '../../db/pool.js';

// Único lugar con SQL de `comics`, `tags` y `comic_tags`. snake_case en la BD, camelCase hacia fuera.

export type TagType = 'genre' | 'theme';

export interface TagInput {
  slug: string;
  name: string;
  type: TagType;
}

// Lo justo para decidir qué hace la importación con una carpeta (RN-18): si existe, de quién es y si se retiró.
export interface ComicRef {
  id: number;
  authorId: number | null; // NULL = importada
  deletedAt: Date | null;
}

export interface NewComic {
  slug: string;
  title: string;
  synopsis: string;
  authorId: number | null;
  authorCredit: string;
  license: string;
  licenseUrl: string | null;
  isAdult: boolean;
  contentWarning: string | null;
  coverKey: string | null;
  status: 'pending' | 'approved';
}

export async function findComicRefBySlug(db: Queryable, slug: string): Promise<ComicRef | null> {
  const { rows } = await db.query<{ id: number; author_id: number | null; deleted_at: Date | null }>(
    'SELECT id, author_id, deleted_at FROM comics WHERE slug = $1',
    [slug],
  );
  const row = rows[0];
  return row ? { id: row.id, authorId: row.author_id, deletedAt: row.deleted_at } : null;
}

// Ficha de una obra (CU-02), en cualquier estado: el servicio decide 404 o 410. `publishedBy` es el nombre
// visible de su autor (NULL = importada: "la plataforma", RN-07).
export interface ComicRow {
  id: number;
  slug: string;
  title: string;
  synopsis: string;
  authorId: number | null;
  authorCredit: string;
  publishedBy: string | null;
  license: string;
  licenseUrl: string | null;
  contentWarning: string | null;
  coverKey: string | null;
  status: 'pending' | 'approved' | 'rejected';
  deletedAt: Date | null;
  tags: TagInput[];
}

export async function findComicBySlug(db: Queryable, slug: string): Promise<ComicRow | null> {
  const { rows } = await db.query<{
    id: number;
    slug: string;
    title: string;
    synopsis: string;
    author_id: number | null;
    author_credit: string;
    published_by: string | null;
    license: string;
    license_url: string | null;
    content_warning: string | null;
    cover_key: string | null;
    status: ComicRow['status'];
    deleted_at: Date | null;
    tags: TagInput[];
  }>(
    `SELECT c.id, c.slug, c.title, c.synopsis, c.author_id, c.author_credit, u.display_name AS published_by, c.license,
            c.license_url, c.content_warning, c.cover_key, c.status, c.deleted_at, ${COMIC_TAGS_JSON} AS tags
     FROM comics c LEFT JOIN users u ON u.id = c.author_id
     WHERE c.slug = $1`,
    [slug],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    synopsis: row.synopsis,
    authorId: row.author_id,
    authorCredit: row.author_credit,
    publishedBy: row.published_by,
    license: row.license,
    licenseUrl: row.license_url,
    contentWarning: row.content_warning,
    coverKey: row.cover_key,
    status: row.status,
    deletedAt: row.deleted_at,
    tags: row.tags,
  };
}

export async function insertComic(db: Queryable, comic: NewComic): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO comics (slug, title, synopsis, author_id, author_credit, license, license_url, is_adult,
                         content_warning, cover_key, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      comic.slug,
      comic.title,
      comic.synopsis,
      comic.authorId,
      comic.authorCredit,
      comic.license,
      comic.licenseUrl,
      comic.isAdult,
      comic.contentWarning,
      comic.coverKey,
      comic.status,
    ],
  );
  return rows[0]!.id;
}

// Etiquetas existentes con esos slugs, bloqueadas hasta el final de la transacción: la importación compara
// con ellas qué crea y qué cambia, y lo audita.
export async function findTagsBySlugsForUpdate(db: Queryable, slugs: readonly string[]): Promise<TagInput[]> {
  if (slugs.length === 0) return [];
  const { rows } = await db.query<TagInput>('SELECT slug, name, type FROM tags WHERE slug = ANY($1::text[]) FOR UPDATE', [slugs]);
  return rows;
}

// Etiquetas de content/tags.json: se crean o se actualizan su nombre y su tipo (modelo_datos.md, "Seeds").
export async function upsertTags(db: Queryable, tags: readonly TagInput[]): Promise<void> {
  if (tags.length === 0) return;
  await db.query(
    `INSERT INTO tags (slug, name, type)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type`,
    [tags.map((tag) => tag.slug), tags.map((tag) => tag.name), tags.map((tag) => tag.type)],
  );
}

// Enlaza la obra con las etiquetas de esos slugs (las que no existen se ignoran: el llamador ya las validó).
export async function addComicTags(db: Queryable, comicId: number, tagSlugs: readonly string[]): Promise<void> {
  if (tagSlugs.length === 0) return;
  await db.query(
    `INSERT INTO comic_tags (comic_id, tag_id)
     SELECT $1, id FROM tags WHERE slug = ANY($2::text[])
     ON CONFLICT DO NOTHING`,
    [comicId, tagSlugs],
  );
}

// --- Catálogo (CU-01) ---

// ILIKE trata % y _ como comodines y \ como escape: se escapan para buscar el texto tal cual.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

// Etiquetas de una obra como JSON, por tipo (géneros primero) y nombre. `c` es el alias de `comics`.
const COMIC_TAGS_JSON = `COALESCE((
    SELECT json_agg(json_build_object('slug', t.slug, 'name', t.name, 'type', t.type) ORDER BY t.type, t.name)
    FROM comic_tags ct JOIN tags t ON t.id = ct.tag_id
    WHERE ct.comic_id = c.id
  ), '[]'::json)`;

// Obras públicas que cumplen la búsqueda: $1 = texto ya escapado ('' = sin filtro), $2 = slugs de etiquetas
// combinados con Y (vacío = sin filtro; uno que no existe deja la lista vacía). Fragmento fijo, sin datos.
const CATALOG_WHERE = `c.status = 'approved' AND c.deleted_at IS NULL
  AND ($1 = '' OR c.title ILIKE '%' || $1 || '%' OR c.author_credit ILIKE '%' || $1 || '%')
  AND (cardinality($2::text[]) = 0 OR c.id IN (
    SELECT ct.comic_id FROM comic_tags ct JOIN tags t ON t.id = ct.tag_id
    WHERE t.slug = ANY($2::text[])
    GROUP BY ct.comic_id
    HAVING count(*) = cardinality($2::text[])
  ))`;

export interface ComicCardRow {
  slug: string;
  title: string;
  authorCredit: string;
  coverKey: string | null;
  tags: TagInput[];
}

export interface CatalogSearch {
  q: string; // sin escapar: se escapa aquí
  tagSlugs: readonly string[]; // sin repetidos
  limit: number;
  offset: number;
}

export async function listTags(db: Queryable): Promise<TagInput[]> {
  const { rows } = await db.query<TagInput>('SELECT slug, name, type FROM tags ORDER BY type, name');
  return rows;
}

// De la más reciente a la más antigua (el id desempata: la paginación es estable).
export async function searchApprovedComics(db: Queryable, search: CatalogSearch): Promise<{ total: number; comics: ComicCardRow[] }> {
  // Una tras otra: con un PoolClient (transacción) no se lanzan dos consultas a la vez.
  const params = [escapeLike(search.q), search.tagSlugs];
  const count = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM comics c WHERE ${CATALOG_WHERE}`, params);
  const page = await db.query<{ slug: string; title: string; author_credit: string; cover_key: string | null; tags: TagInput[] }>(
    `SELECT c.slug, c.title, c.author_credit, c.cover_key, ${COMIC_TAGS_JSON} AS tags
     FROM comics c WHERE ${CATALOG_WHERE}
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT $3 OFFSET $4`,
    [...params, search.limit, search.offset],
  );
  return {
    total: count.rows[0]?.total ?? 0,
    comics: page.rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      authorCredit: row.author_credit,
      coverKey: row.cover_key,
      tags: row.tags,
    })),
  };
}
