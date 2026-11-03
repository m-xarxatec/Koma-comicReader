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
