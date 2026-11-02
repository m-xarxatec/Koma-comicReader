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
