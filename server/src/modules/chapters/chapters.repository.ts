import type { Queryable } from '../../db/pool.js';

// Único lugar con SQL de `chapters` y `panels`. snake_case en la BD, camelCase hacia fuera.

export interface NewPanel {
  imageKey: string;
  width: number; // px, leídos de la cabecera del archivo (RN-18)
  height: number;
}

// Números con alguna fila en la obra, en cualquier estado (también retirados o rechazados): la importación
// no vuelve a crear un capítulo que un admin retiró (RN-18, "un capítulo ya existente se omite").
export async function findChapterNumbers(db: Queryable, comicId: number): Promise<Set<number>> {
  const { rows } = await db.query<{ number: number }>('SELECT DISTINCT number FROM chapters WHERE comic_id = $1', [comicId]);
  return new Set(rows.map((row) => row.number));
}

// Capítulo publicado al crearse: el contenido importado nace aprobado (RN-05, RN-18).
export async function insertApprovedChapter(db: Queryable, comicId: number, number: number, title: string): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO chapters (comic_id, number, title, status, published_at)
     VALUES ($1, $2, $3, 'approved', now())
     RETURNING id`,
    [comicId, number, title],
  );
  return rows[0]!.id;
}

// Viñetas en el orden recibido: posiciones 1, 2, 3… (RN-09).
export async function insertPanels(db: Queryable, chapterId: number, panels: readonly NewPanel[]): Promise<void> {
  if (panels.length === 0) return;
  await db.query(
    `INSERT INTO panels (chapter_id, position, image_key, width, height)
     SELECT $1, ordinality, image_key, width, height
     FROM unnest($2::text[], $3::int[], $4::int[]) WITH ORDINALITY AS p(image_key, width, height, ordinality)`,
    [chapterId, panels.map((panel) => panel.imageKey), panels.map((panel) => panel.width), panels.map((panel) => panel.height)],
  );
}

// --- Lectura pública (CU-02, CU-03) ---

// Condición de un capítulo público: aprobado y no retirado. Fragmento fijo, sin datos.
const PUBLIC_CHAPTER = `status = 'approved' AND deleted_at IS NULL`;

export interface ChapterSummaryRow {
  id: number;
  number: number;
  title: string;
  publishedAt: Date;
}

// Capítulos públicos de la obra, por número (ficha, CU-02).
export async function listPublicChapters(db: Queryable, comicId: number): Promise<ChapterSummaryRow[]> {
  const { rows } = await db.query<{ id: number; number: number; title: string; published_at: Date }>(
    `SELECT id, number, title, published_at FROM chapters WHERE comic_id = $1 AND ${PUBLIC_CHAPTER} ORDER BY number`,
    [comicId],
  );
  return rows.map((row) => ({ id: row.id, number: row.number, title: row.title, publishedAt: row.published_at }));
}

export interface ChapterRow {
  id: number;
  number: number;
  title: string;
  withdrawn: boolean; // se publicó y después se retiró (410, RN-06)
}

// El capítulo con ese número que se puede leer o, si no hay, uno que se publicó y se retiró (410). Un
// borrador, pendiente o rechazado nunca fue público: no se devuelve (404).
export async function findChapterForReading(db: Queryable, comicId: number, number: number): Promise<ChapterRow | null> {
  const { rows } = await db.query<{ id: number; number: number; title: string; withdrawn: boolean }>(
    `SELECT id, number, title, deleted_at IS NOT NULL AS withdrawn
     FROM chapters
     WHERE comic_id = $1 AND number = $2
       AND ((${PUBLIC_CHAPTER}) OR (deleted_at IS NOT NULL AND published_at IS NOT NULL))
     ORDER BY deleted_at IS NULL DESC, deleted_at DESC
     LIMIT 1`,
    [comicId, number],
  );
  return rows[0] ?? null;
}

// Números del capítulo público anterior y siguiente (los números pueden saltar: 1, 2, 5).
export async function findAdjacentNumbers(db: Queryable, comicId: number, number: number): Promise<{ prev: number | null; next: number | null }> {
  const { rows } = await db.query<{ prev: number | null; next: number | null }>(
    `SELECT (SELECT max(number) FROM chapters WHERE comic_id = $1 AND number < $2 AND ${PUBLIC_CHAPTER}) AS prev,
            (SELECT min(number) FROM chapters WHERE comic_id = $1 AND number > $2 AND ${PUBLIC_CHAPTER}) AS next`,
    [comicId, number],
  );
  return { prev: rows[0]?.prev ?? null, next: rows[0]?.next ?? null };
}

export interface PanelRow {
  position: number;
  imageKey: string;
  width: number;
  height: number;
}

export async function listPanels(db: Queryable, chapterId: number): Promise<PanelRow[]> {
  const { rows } = await db.query<{ position: number; image_key: string; width: number; height: number }>(
    'SELECT position, image_key, width, height FROM panels WHERE chapter_id = $1 ORDER BY position',
    [chapterId],
  );
  return rows.map((row) => ({ position: row.position, imageKey: row.image_key, width: row.width, height: row.height }));
}
