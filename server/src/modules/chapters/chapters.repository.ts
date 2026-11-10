import type { Queryable } from '../../db/pool.js';

// Único lugar con SQL de `chapters` y `panels`. snake_case en la BD, camelCase hacia fuera.

export interface NewPanel {
  imageKey: string;
  width: number; // px, leídos de la cabecera del archivo (RN-18)
  height: number;
}

// Capítulos vivos de una obra (ni retirados ni rechazados: la condición del índice único de número), número → id.
// Un número con solo capítulos retirados o rechazados está libre: el capítulo que llegue lo reemplaza (RN-09).
export async function findLiveChapterIds(db: Queryable, comicId: number): Promise<Map<number, number>> {
  const { rows } = await db.query<{ id: number; number: number }>(
    `SELECT id, number FROM chapters WHERE comic_id = $1 AND deleted_at IS NULL AND status <> 'rejected'`,
    [comicId],
  );
  return new Map(rows.map((row) => [row.number, row.id]));
}

// Los mismos, solo con esos números y bloqueados (FOR UPDATE) dentro de la transacción que los va a retirar.
export async function lockLiveChapterIds(db: Queryable, comicId: number, numbers: readonly number[]): Promise<Map<number, number>> {
  const { rows } = await db.query<{ id: number; number: number }>(
    `SELECT id, number FROM chapters
     WHERE comic_id = $1 AND number = ANY($2::int[]) AND deleted_at IS NULL AND status <> 'rejected'
     FOR UPDATE`,
    [comicId, numbers],
  );
  return new Map(rows.map((row) => [row.number, row.id]));
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

// Números del capítulo anterior y siguiente (los números pueden saltar: 1, 2, 5) entre los que ve quien lee: los
// públicos o, en la vista previa del dueño y del admin (D10), todos los vivos (también draft y pending).
export async function findAdjacentNumbers(
  db: Queryable,
  comicId: number,
  number: number,
  includeUnpublished = false,
): Promise<{ prev: number | null; next: number | null }> {
  const visible = includeUnpublished ? LIVE_CHAPTER : PUBLIC_CHAPTER;
  const { rows } = await db.query<{ prev: number | null; next: number | null }>(
    `SELECT (SELECT max(number) FROM chapters WHERE comic_id = $1 AND number < $2 AND ${visible}) AS prev,
            (SELECT min(number) FROM chapters WHERE comic_id = $1 AND number > $2 AND ${visible}) AS next`,
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

// Id de la viñeta en esa posición del capítulo (comentarios, CU-05 y CU-13).
export async function findPanelId(db: Queryable, chapterId: number, position: number): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM panels WHERE chapter_id = $1 AND position = $2', [chapterId, position]);
  return rows[0]?.id ?? null;
}

// --- Autor (CU-28 a CU-30; contrato del bloque 3) ---

export interface AuthorChapterSummaryRow {
  id: number;
  comicId: number;
  number: number;
  title: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  panelCount: number;
  publishedAt: Date | null;
}

// Capítulos de esas obras sin los retirados, por número (y, con el mismo número, del más antiguo al más reciente:
// un rechazado y su reemplazo). Los rechazados salen con su motivo.
export async function listAuthorChapterSummaries(db: Queryable, comicIds: readonly number[]): Promise<AuthorChapterSummaryRow[]> {
  if (comicIds.length === 0) return [];
  const { rows } = await db.query<{
    id: number;
    comic_id: number;
    number: number;
    title: string;
    status: AuthorChapterSummaryRow['status'];
    rejection_reason: string | null;
    panel_count: number;
    published_at: Date | null;
  }>(
    `SELECT ch.id, ch.comic_id, ch.number, ch.title, ch.status, ch.rejection_reason, ch.published_at,
            (SELECT count(*)::int FROM panels p WHERE p.chapter_id = ch.id) AS panel_count
     FROM chapters ch
     WHERE ch.comic_id = ANY($1::int[]) AND ch.deleted_at IS NULL
     ORDER BY ch.comic_id, ch.number, ch.created_at, ch.id`,
    [comicIds],
  );
  return rows.map((row) => ({
    id: row.id,
    comicId: row.comic_id,
    number: row.number,
    title: row.title,
    status: row.status,
    rejectionReason: row.rejection_reason,
    panelCount: row.panel_count,
    publishedAt: row.published_at,
  }));
}

// Capítulo vivo (contrato del bloque 3): el de ese número con deleted_at IS NULL y status <> 'rejected', único
// por chapters_comic_number_uq. Fragmento fijo, sin datos.
const LIVE_CHAPTER = `deleted_at IS NULL AND status <> 'rejected'`;

export interface LiveChapterRow {
  id: number;
  number: number;
  title: string;
  status: 'draft' | 'pending' | 'approved';
  publishedAt: Date | null;
}

// `lock`: FOR UPDATE hasta el final de la transacción (subir, borrar y mover viñetas, enviar, retirar).
export async function findLiveChapter(db: Queryable, comicId: number, number: number, lock = false): Promise<LiveChapterRow | null> {
  const { rows } = await db.query<{ id: number; number: number; title: string; status: LiveChapterRow['status']; published_at: Date | null }>(
    `SELECT id, number, title, status, published_at FROM chapters
     WHERE comic_id = $1 AND number = $2 AND ${LIVE_CHAPTER}${lock ? ' FOR UPDATE' : ''}`,
    [comicId, number],
  );
  const row = rows[0];
  return row ? { id: row.id, number: row.number, title: row.title, status: row.status, publishedAt: row.published_at } : null;
}

// Si ese número tuvo un capítulo rechazado (sin retirar): el admin que lo revisa otra vez recibe 409, no 404.
export async function hasRejectedChapter(db: Queryable, comicId: number, number: number): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM chapters WHERE comic_id = $1 AND number = $2 AND deleted_at IS NULL AND status = 'rejected' LIMIT 1`,
    [comicId, number],
  );
  return rows.length > 0;
}

// CU-29: nace en `draft`. Un número ocupado por un capítulo vivo lanza 23505 en chapters_comic_number_uq.
export async function insertDraftChapter(db: Queryable, comicId: number, number: number, title: string): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO chapters (comic_id, number, title) VALUES ($1, $2, $3) RETURNING id`,
    [comicId, number, title],
  );
  return rows[0]!.id;
}

// Número de viñetas y la última posición (con el capítulo ya bloqueado por quien llama).
export async function countPanels(db: Queryable, chapterId: number): Promise<number> {
  const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM panels WHERE chapter_id = $1', [chapterId]);
  return rows[0]!.n;
}

// Una viñeta nueva va al final: max(position) + 1, calculada con el capítulo bloqueado (modelo_datos.md).
export async function appendPanel(db: Queryable, chapterId: number, panel: NewPanel): Promise<number> {
  const { rows } = await db.query<{ position: number }>(
    `INSERT INTO panels (chapter_id, position, image_key, width, height)
     SELECT $1, COALESCE(max(position), 0) + 1, $2, $3, $4 FROM panels WHERE chapter_id = $1
     RETURNING position`,
    [chapterId, panel.imageKey, panel.width, panel.height],
  );
  return rows[0]!.position;
}

export async function findPanelAt(db: Queryable, chapterId: number, position: number): Promise<{ id: number; imageKey: string } | null> {
  const { rows } = await db.query<{ id: number; image_key: string }>(
    'SELECT id, image_key FROM panels WHERE chapter_id = $1 AND position = $2',
    [chapterId, position],
  );
  return rows[0] ? { id: rows[0].id, imageKey: rows[0].image_key } : null;
}

// RN-05: borrado físico de una viñeta de un borrador y recompactación (SQL de modelo_datos.md). Dentro de una
// transacción: SET CONSTRAINTS dura hasta su final.
export async function deletePanelAndCompact(db: Queryable, chapterId: number, panelId: number, position: number): Promise<void> {
  await db.query('SET CONSTRAINTS panels_chapter_position_uq DEFERRED');
  await db.query('DELETE FROM panels WHERE id = $1', [panelId]);
  await db.query('UPDATE panels SET position = position - 1 WHERE chapter_id = $1 AND position > $2', [chapterId, position]);
}

// RN-05 (D9): mueve la viñeta de `from` a `to` y desplaza las intermedias (SQL de modelo_datos.md). Dentro de una
// transacción, con el capítulo bloqueado. Los ::int hacen falta: en `$3 < $2` PostgreSQL no puede deducir el tipo
// de los parámetros y los toma como texto (42883 al compararlos después con `position`).
export async function movePanel(db: Queryable, chapterId: number, from: number, to: number): Promise<void> {
  await db.query('SET CONSTRAINTS panels_chapter_position_uq DEFERRED');
  await db.query(
    `UPDATE panels
     SET position = CASE WHEN position = $2::int THEN $3::int
                         WHEN $3::int < $2::int THEN position + 1
                         ELSE position - 1 END
     WHERE chapter_id = $1 AND position BETWEEN least($2::int, $3::int) AND greatest($2::int, $3::int)`,
    [chapterId, from, to],
  );
}

// RN-05: de draft a pending ("Enviar a revisión").
export async function submitChapter(db: Queryable, chapterId: number): Promise<void> {
  await db.query(`UPDATE chapters SET status = 'pending' WHERE id = $1 AND status = 'draft'`, [chapterId]);
}

// Resumen de un capítulo por id (con su número de viñetas), para el AuthorChapterDto.
export async function findChapterSummaryById(db: Queryable, chapterId: number): Promise<AuthorChapterSummaryRow | null> {
  const { rows } = await db.query<{
    id: number;
    comic_id: number;
    number: number;
    title: string;
    status: AuthorChapterSummaryRow['status'];
    rejection_reason: string | null;
    panel_count: number;
    published_at: Date | null;
  }>(
    `SELECT ch.id, ch.comic_id, ch.number, ch.title, ch.status, ch.rejection_reason, ch.published_at,
            (SELECT count(*)::int FROM panels p WHERE p.chapter_id = ch.id) AS panel_count
     FROM chapters ch WHERE ch.id = $1`,
    [chapterId],
  );
  const row = rows[0];
  return row
    ? {
        id: row.id,
        comicId: row.comic_id,
        number: row.number,
        title: row.title,
        status: row.status,
        rejectionReason: row.rejection_reason,
        panelCount: row.panel_count,
        publishedAt: row.published_at,
      }
    : null;
}

// CU-30: retirada lógica del capítulo vivo; su número queda libre (chapters_comic_number_uq). Devuelve el instante.
export async function withdrawChapter(db: Queryable, chapterId: number): Promise<Date> {
  const { rows } = await db.query<{ deleted_at: Date }>('UPDATE chapters SET deleted_at = now() WHERE id = $1 RETURNING deleted_at', [chapterId]);
  return rows[0]!.deleted_at;
}

// --- Vista previa del dueño y del admin (D10) ---

export interface VisibleChapterRow {
  id: number;
  number: number;
  title: string;
  status: 'draft' | 'pending' | 'approved';
  publishedAt: Date | null; // null si nunca se aprobó
}

// Capítulos vivos de la obra (draft, pending y approved, sin retirados ni rechazados), por número: la ficha del
// dueño y del admin.
export async function listLiveChapters(db: Queryable, comicId: number): Promise<VisibleChapterRow[]> {
  const { rows } = await db.query<{ id: number; number: number; title: string; status: VisibleChapterRow['status']; published_at: Date | null }>(
    `SELECT id, number, title, status, published_at FROM chapters WHERE comic_id = $1 AND ${LIVE_CHAPTER} ORDER BY number`,
    [comicId],
  );
  return rows.map((row) => ({ id: row.id, number: row.number, title: row.title, status: row.status, publishedAt: row.published_at }));
}

// --- Bloque 4: aprobación de contenido (CU-32; RN-05, RN-09) ---

export interface ReviewChapterRow {
  id: number;
  number: number;
  title: string;
  panelCount: number;
  submittedAt: Date; // updated_at: el envío es su último cambio (desde pending ya no se edita, RN-05)
  comic: { slug: string; title: string; status: 'pending' | 'approved'; publishedBy: string; isAdult: boolean; contentWarning: string | null };
}

// Cola: capítulos vivos pending de obras sin retirar y no rechazadas (D2), del envío más antiguo al más reciente.
export async function listPendingChapters(db: Queryable, limit: number): Promise<{ total: number; chapters: ReviewChapterRow[] }> {
  const { rows } = await db.query<{
    id: number;
    number: number;
    title: string;
    panel_count: number;
    updated_at: Date;
    slug: string;
    comic_title: string;
    comic_status: 'pending' | 'approved';
    published_by: string;
    is_adult: boolean;
    content_warning: string | null;
    total: number;
  }>(
    `SELECT ch.id, ch.number, ch.title, (SELECT count(*)::int FROM panels p WHERE p.chapter_id = ch.id) AS panel_count,
            ch.updated_at, c.slug, c.title AS comic_title, c.status AS comic_status,
            coalesce(u.display_name, 'la plataforma') AS published_by, c.is_adult, c.content_warning,
            count(*) OVER ()::int AS total
     FROM chapters ch
     JOIN comics c ON c.id = ch.comic_id
     LEFT JOIN users u ON u.id = c.author_id
     WHERE ch.status = 'pending' AND ch.deleted_at IS NULL AND c.deleted_at IS NULL AND c.status <> 'rejected'
     ORDER BY ch.updated_at, ch.id
     LIMIT $1`,
    [limit],
  );
  return {
    total: rows[0]?.total ?? 0, // con LIMIT ≥ 1, sin filas la cola está vacía
    chapters: rows.map((row) => ({
      id: row.id,
      number: row.number,
      title: row.title,
      panelCount: row.panel_count,
      submittedAt: row.updated_at,
      comic: {
        slug: row.slug,
        title: row.comic_title,
        status: row.comic_status,
        publishedBy: row.published_by,
        isAdult: row.is_adult,
        contentWarning: row.content_warning,
      },
    })),
  };
}

// Aprobar fija published_at (CHECK chapters_published); rechazar guarda el motivo y libera el número (RN-09).
export async function approveChapter(db: Queryable, id: number): Promise<Date> {
  const { rows } = await db.query<{ published_at: Date }>(
    `UPDATE chapters SET status = 'approved', published_at = now() WHERE id = $1 RETURNING published_at`,
    [id],
  );
  return rows[0]!.published_at;
}

export async function rejectChapter(db: Queryable, id: number, reason: string): Promise<void> {
  await db.query(`UPDATE chapters SET status = 'rejected', rejection_reason = $2 WHERE id = $1`, [id, reason]);
}
