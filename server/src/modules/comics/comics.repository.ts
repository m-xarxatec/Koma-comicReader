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
  authorshipDeclared: boolean; // RN-07: obligatoria si hay author_id (CHECK comics_authorship)
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
                         content_warning, cover_key, status, authorship_declared)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
      comic.authorshipDeclared,
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

// --- Obras del autor (CU-28, CU-30; contrato del bloque 3) ---

// Slugs ocupados que podrían chocar con `base` o con sus sufijos (-2, -3…), también los de obras retiradas
// (RN-09). La base solo tiene [a-z0-9-] (slugify), pero se escapa igualmente para el LIKE.
export async function findSlugsLike(db: Queryable, base: string): Promise<Set<string>> {
  const { rows } = await db.query<{ slug: string }>(`SELECT slug FROM comics WHERE slug = $1 OR slug LIKE $2`, [
    base,
    `${escapeLike(base)}-%`,
  ]);
  return new Set(rows.map((row) => row.slug));
}

// Etiquetas existentes con esos slugs (el alta comprueba que existan todas y que haya un género).
export async function findTagsBySlugs(db: Queryable, slugs: readonly string[]): Promise<TagInput[]> {
  if (slugs.length === 0) return [];
  const { rows } = await db.query<TagInput>('SELECT slug, name, type FROM tags WHERE slug = ANY($1::text[])', [slugs]);
  return rows;
}

export interface AuthorComicRow {
  id: number;
  slug: string;
  title: string;
  synopsis: string;
  authorId: number;
  authorCredit: string;
  license: string;
  licenseUrl: string | null;
  isAdult: boolean;
  contentWarning: string | null;
  coverKey: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  tags: TagInput[];
}

interface AuthorComicDbRow {
  id: number;
  slug: string;
  title: string;
  synopsis: string;
  author_id: number;
  author_credit: string;
  license: string;
  license_url: string | null;
  is_adult: boolean;
  content_warning: string | null;
  cover_key: string | null;
  status: AuthorComicRow['status'];
  rejection_reason: string | null;
  deleted_at: Date | null;
  created_at: Date;
  tags: TagInput[];
}

const AUTHOR_COMIC_COLUMNS = `c.id, c.slug, c.title, c.synopsis, c.author_id, c.author_credit, c.license, c.license_url,
  c.is_adult, c.content_warning, c.cover_key, c.status, c.rejection_reason, c.deleted_at, c.created_at,
  ${COMIC_TAGS_JSON} AS tags`;

function toAuthorComicRow(row: AuthorComicDbRow): AuthorComicRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    synopsis: row.synopsis,
    authorId: row.author_id,
    authorCredit: row.author_credit,
    license: row.license,
    licenseUrl: row.license_url,
    isAdult: row.is_adult,
    contentWarning: row.content_warning,
    coverKey: row.cover_key,
    status: row.status,
    rejectionReason: row.rejection_reason,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    tags: row.tags,
  };
}

// Obras de un autor sin las retiradas, de la más reciente a la más antigua (GET /api/author/comics).
export async function listAuthorComics(db: Queryable, authorId: number): Promise<AuthorComicRow[]> {
  const { rows } = await db.query<AuthorComicDbRow>(
    `SELECT ${AUTHOR_COMIC_COLUMNS} FROM comics c
     WHERE c.author_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC, c.id DESC`,
    [authorId],
  );
  return rows.map(toAuthorComicRow);
}

// Una obra por slug con los campos del autor, en cualquier estado (después de cambiar su portada).
export async function findAuthorComicBySlug(db: Queryable, slug: string): Promise<AuthorComicRow | null> {
  const { rows } = await db.query<AuthorComicDbRow>(`SELECT ${AUTHOR_COMIC_COLUMNS} FROM comics c WHERE c.slug = $1`, [slug]);
  return rows[0] ? toAuthorComicRow(rows[0]) : null;
}

// Una obra por id con los campos del autor, en cualquier estado (la que se acaba de crear).
export async function findAuthorComicById(db: Queryable, id: number): Promise<AuthorComicRow | null> {
  const { rows } = await db.query<AuthorComicDbRow>(`SELECT ${AUTHOR_COMIC_COLUMNS} FROM comics c WHERE c.id = $1`, [id]);
  return rows[0] ? toAuthorComicRow(rows[0]) : null;
}

// Lo que hace falta para decidir sobre una obra del autor (propiedad, estado y retirada) y su portada actual.
// `lock`: FOR UPDATE hasta el final de la transacción (portada, capítulos, retirada).
export interface ComicState {
  id: number;
  authorId: number | null;
  status: 'pending' | 'approved' | 'rejected';
  coverKey: string | null;
  deletedAt: Date | null;
}

export async function findComicState(db: Queryable, slug: string, lock = false): Promise<ComicState | null> {
  const { rows } = await db.query<{ id: number; author_id: number | null; status: ComicState['status']; cover_key: string | null; deleted_at: Date | null }>(
    `SELECT id, author_id, status, cover_key, deleted_at FROM comics WHERE slug = $1${lock ? ' FOR UPDATE' : ''}`,
    [slug],
  );
  const row = rows[0];
  return row ? { id: row.id, authorId: row.author_id, status: row.status, coverKey: row.cover_key, deletedAt: row.deleted_at } : null;
}

export async function updateCoverKey(db: Queryable, id: number, coverKey: string): Promise<void> {
  await db.query('UPDATE comics SET cover_key = $2 WHERE id = $1', [id, coverKey]);
}

// RN-06: retirada lógica. Devuelve el instante guardado (para la auditoría).
export async function withdrawComic(db: Queryable, id: number): Promise<Date> {
  const { rows } = await db.query<{ deleted_at: Date }>('UPDATE comics SET deleted_at = now() WHERE id = $1 RETURNING deleted_at', [id]);
  return rows[0]!.deleted_at;
}

// --- Editar obra (CU-30) ---

export interface ComicFieldsUpdate {
  title?: string;
  synopsis?: string;
  authorCredit?: string;
  license?: string;
  licenseUrl?: string | null;
  contentWarning?: string | null;
  isAdult?: boolean;
}

// Lista blanca: cada campo editable con su columna. El SET se construye solo con estas columnas fijas; los valores van
// siempre como parámetros.
const EDITABLE_COLUMNS: Readonly<Record<keyof ComicFieldsUpdate, string>> = {
  title: 'title',
  synopsis: 'synopsis',
  authorCredit: 'author_credit',
  license: 'license',
  licenseUrl: 'license_url',
  contentWarning: 'content_warning',
  isAdult: 'is_adult',
};

export async function updateComicFields(db: Queryable, id: number, fields: ComicFieldsUpdate): Promise<void> {
  const entries = (Object.keys(EDITABLE_COLUMNS) as (keyof ComicFieldsUpdate)[]).filter((key) => fields[key] !== undefined);
  if (entries.length === 0) return;
  const assignments = entries.map((key, index) => `${EDITABLE_COLUMNS[key]} = $${index + 2}`);
  await db.query(`UPDATE comics SET ${assignments.join(', ')} WHERE id = $1`, [id, ...entries.map((key) => fields[key])]);
}

// Sustituye las etiquetas de la obra por las de esos slugs (ya comprobados por el servicio).
export async function replaceComicTags(db: Queryable, comicId: number, tagSlugs: readonly string[]): Promise<void> {
  await db.query('DELETE FROM comic_tags WHERE comic_id = $1', [comicId]);
  await addComicTags(db, comicId, tagSlugs);
}

// --- Panel del autor (CU-31 recortado; RN-19) ---

// Hoy en Europe/Madrid (RN-19). Las estadísticas globales (RN-20, admin.repository.ts) usan el mismo día.
export const MADRID_TODAY = "(now() AT TIME ZONE 'Europe/Madrid')::date";

export interface AuthorStatusCounts {
  today: string; // 'YYYY-MM-DD' en Europe/Madrid
  comics: { pending: number; approved: number; rejected: number };
  chapters: { draft: number; pending: number; approved: number; rejected: number };
}

// Obras por estado sin las retiradas; capítulos por estado sin los retirados, de obras no retiradas.
export async function countAuthorStatuses(db: Queryable, authorId: number): Promise<AuthorStatusCounts> {
  const { rows } = await db.query<{
    today: string;
    comics_pending: number;
    comics_approved: number;
    comics_rejected: number;
    chapters_draft: number;
    chapters_pending: number;
    chapters_approved: number;
    chapters_rejected: number;
  }>(
    `WITH own AS (SELECT id, status FROM comics WHERE author_id = $1 AND deleted_at IS NULL),
          own_chapters AS (SELECT ch.status FROM chapters ch JOIN own ON own.id = ch.comic_id WHERE ch.deleted_at IS NULL)
     SELECT to_char(${MADRID_TODAY}, 'YYYY-MM-DD') AS today,
            (SELECT count(*) FROM own WHERE status = 'pending')::int AS comics_pending,
            (SELECT count(*) FROM own WHERE status = 'approved')::int AS comics_approved,
            (SELECT count(*) FROM own WHERE status = 'rejected')::int AS comics_rejected,
            (SELECT count(*) FROM own_chapters WHERE status = 'draft')::int AS chapters_draft,
            (SELECT count(*) FROM own_chapters WHERE status = 'pending')::int AS chapters_pending,
            (SELECT count(*) FROM own_chapters WHERE status = 'approved')::int AS chapters_approved,
            (SELECT count(*) FROM own_chapters WHERE status = 'rejected')::int AS chapters_rejected`,
    [authorId],
  );
  const row = rows[0]!;
  return {
    today: row.today,
    comics: { pending: row.comics_pending, approved: row.comics_approved, rejected: row.comics_rejected },
    chapters: { draft: row.chapters_draft, pending: row.chapters_pending, approved: row.chapters_approved, rejected: row.chapters_rejected },
  };
}

export interface ReadCounts {
  total: number;
  lastShort: number; // READS_WINDOW_SHORT_DAYS con hoy incluido
  lastLong: number; // READS_WINDOW_LONG_DAYS con hoy incluido
}

// Una fila por obra viva del autor y capítulo approved vivo (chapterNumber null si la obra no tiene ninguno), con
// sus lecturas = guest_reads + user_reads. De la obra más reciente a la más antigua y por número.
export interface AuthorChapterReadsRow {
  comicId: number;
  slug: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  chapterNumber: number | null;
  chapterTitle: string | null;
  reads: ReadCounts;
}

export async function listAuthorChapterReads(db: Queryable, authorId: number, windows: { shortDays: number; longDays: number }): Promise<AuthorChapterReadsRow[]> {
  const { rows } = await db.query<{
    comic_id: number;
    slug: string;
    title: string;
    status: AuthorChapterReadsRow['status'];
    number: number | null;
    chapter_title: string | null;
    total: number;
    last_short: number;
    last_long: number;
  }>(
    `SELECT co.id AS comic_id, co.slug, co.title, co.status, ch.number, ch.title AS chapter_title,
            COALESCE(sum(r.guest_reads + r.user_reads), 0)::int AS total,
            COALESCE(sum(r.guest_reads + r.user_reads) FILTER (WHERE r.day > ${MADRID_TODAY} - $2::int), 0)::int AS last_short,
            COALESCE(sum(r.guest_reads + r.user_reads) FILTER (WHERE r.day > ${MADRID_TODAY} - $3::int), 0)::int AS last_long
     FROM comics co
     LEFT JOIN chapters ch ON ch.comic_id = co.id AND ch.status = 'approved' AND ch.deleted_at IS NULL
     LEFT JOIN chapter_read_counts r ON r.chapter_id = ch.id
     WHERE co.author_id = $1 AND co.deleted_at IS NULL
     GROUP BY co.id, ch.id
     ORDER BY co.created_at DESC, co.id DESC, ch.number`,
    [authorId, windows.shortDays, windows.longDays],
  );
  return rows.map((row) => ({
    comicId: row.comic_id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    chapterNumber: row.number,
    chapterTitle: row.chapter_title,
    reads: { total: row.total, lastShort: row.last_short, lastLong: row.last_long },
  }));
}

// RN-21: punto de abandono por capítulo approved vivo de las obras vivas del autor (contrato del bloque 5). Cuántos
// lectores se quedaron en cada viñeta máxima, sin filas sin progreso (NULL), sin el admin y sin el propio autor.
export interface AuthorAbandonmentRow {
  comicId: number;
  chapterNumber: number;
  panels: number;
  distribution: { lastPanel: number; readers: number }[];
}

export async function listAuthorAbandonment(db: Queryable, authorId: number): Promise<AuthorAbandonmentRow[]> {
  const { rows } = await db.query<{ comic_id: number; number: number; panels: number; distribution: { lastPanel: number; readers: number }[] }>(
    `SELECT co.id AS comic_id, ch.number,
            (SELECT count(*)::int FROM panels p WHERE p.chapter_id = ch.id) AS panels,
            COALESCE((SELECT json_agg(json_build_object('lastPanel', d.last_panel, 'readers', d.readers) ORDER BY d.last_panel)
                      FROM (SELECT cr.last_panel, count(*)::int AS readers
                            FROM chapter_reads cr
                            JOIN users u ON u.id = cr.user_id
                            WHERE cr.chapter_id = ch.id AND cr.last_panel IS NOT NULL
                              AND u.role <> 'admin' AND cr.user_id <> co.author_id
                            GROUP BY cr.last_panel) d), '[]'::json) AS distribution
     FROM comics co
     JOIN chapters ch ON ch.comic_id = co.id AND ch.status = 'approved' AND ch.deleted_at IS NULL
     WHERE co.author_id = $1 AND co.deleted_at IS NULL`,
    [authorId],
  );
  return rows.map((row) => ({ comicId: row.comic_id, chapterNumber: row.number, panels: row.panels, distribution: row.distribution }));
}

// --- Bloque 4: aprobación de contenido (CU-32; RN-05, RN-17) ---

export interface ReviewComicRow {
  id: number;
  slug: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  publishedBy: string; // nombre visible del autor; las importadas nunca están pending
  isAdult: boolean;
  contentWarning: string | null;
  createdAt: Date;
}

interface ReviewComicDbRow {
  id: number;
  slug: string;
  title: string;
  status: ReviewComicRow['status'];
  published_by: string;
  is_adult: boolean;
  content_warning: string | null;
  created_at: Date;
}

const toReviewComic = (row: ReviewComicDbRow): ReviewComicRow => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  status: row.status,
  publishedBy: row.published_by,
  isAdult: row.is_adult,
  contentWarning: row.content_warning,
  createdAt: row.created_at,
});

// Cola: obras pending sin retirar, de la más antigua a la más reciente; total = todas las de la cola.
export async function listPendingComics(db: Queryable, limit: number): Promise<{ total: number; comics: ReviewComicRow[] }> {
  const { rows } = await db.query<ReviewComicDbRow & { total: number }>(
    `SELECT c.id, c.slug, c.title, c.status, coalesce(u.display_name, 'la plataforma') AS published_by, c.is_adult,
            c.content_warning, c.created_at, count(*) OVER ()::int AS total
     FROM comics c
     LEFT JOIN users u ON u.id = c.author_id
     WHERE c.status = 'pending' AND c.deleted_at IS NULL
     ORDER BY c.created_at, c.id
     LIMIT $1`,
    [limit],
  );
  // Con LIMIT ≥ 1, sin filas la cola está vacía.
  return { total: rows[0]?.total ?? 0, comics: rows.map(toReviewComic) };
}

export interface ComicReviewState {
  id: number;
  status: 'pending' | 'approved' | 'rejected';
  isAdult: boolean;
  deletedAt: Date | null;
}

// Fila bloqueada hasta el final de la transacción: de dos admins que deciden a la vez, el segundo ve el estado nuevo.
export async function findComicForReview(db: Queryable, slug: string): Promise<ComicReviewState | null> {
  const { rows } = await db.query<{ id: number; status: ComicReviewState['status']; is_adult: boolean; deleted_at: Date | null }>(
    'SELECT id, status, is_adult, deleted_at FROM comics WHERE slug = $1 FOR UPDATE',
    [slug],
  );
  const row = rows[0];
  return row ? { id: row.id, status: row.status, isAdult: row.is_adult, deletedAt: row.deleted_at } : null;
}

// RN-05: aprobar (sin motivo) o rechazar con motivo.
export async function setComicReview(db: Queryable, id: number, status: 'approved' | 'rejected', reason: string | null): Promise<void> {
  await db.query('UPDATE comics SET status = $2, rejection_reason = $3 WHERE id = $1', [id, status, reason]);
}
