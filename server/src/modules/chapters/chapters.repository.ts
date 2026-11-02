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
