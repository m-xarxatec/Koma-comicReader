import type { Queryable } from '../../db/pool.js';

// Único lugar con SQL de `chapter_reads`, `reading_credits`, `chapter_read_counts` y `ads`. snake_case en
// la BD, camelCase hacia fuera.

// Capítulos de esa lista que el usuario ya leyó (chapter_reads): la ficha los marca y no gastan saldo.
export async function findReadChapterIds(db: Queryable, userId: number, chapterIds: readonly number[]): Promise<Set<number>> {
  if (chapterIds.length === 0) return new Set();
  const { rows } = await db.query<{ chapter_id: number }>(
    'SELECT chapter_id FROM chapter_reads WHERE user_id = $1 AND chapter_id = ANY($2::int[])',
    [userId, chapterIds],
  );
  return new Set(rows.map((row) => row.chapter_id));
}

export interface AdRow {
  brand: string;
  body: string;
  imageKey: string | null; // null = tarjeta de texto
}

// Un anuncio activo al azar (RN-03); null si no hay ninguno (solo sin el seed).
export async function pickActiveAd(db: Queryable): Promise<AdRow | null> {
  const { rows } = await db.query<{ brand: string; body: string; image_key: string | null }>(
    'SELECT brand, body, image_key FROM ads WHERE active ORDER BY random() LIMIT 1',
  );
  const row = rows[0];
  return row ? { brand: row.brand, body: row.body, imageKey: row.image_key } : null;
}
