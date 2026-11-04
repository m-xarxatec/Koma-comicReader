import type { Queryable } from '../../db/pool.js';

// Único lugar con SQL de `comments`. snake_case en la BD, camelCase hacia fuera. "Visible" = ni oculto ni
// eliminado (RN-11: un oculto no lo ve nadie, tampoco su autor).

const VISIBLE = 'c.hidden_at IS NULL AND c.deleted_at IS NULL';

export interface CommentRow {
  id: number;
  userId: number;
  authorName: string;
  body: string;
  createdAt: Date;
}

type CommentDbRow = { id: number; user_id: number; author_name: string; body: string; created_at: Date };
const toRow = (row: CommentDbRow): CommentRow => ({
  id: row.id,
  userId: row.user_id,
  authorName: row.author_name,
  body: row.body,
  createdAt: row.created_at,
});

// Comentarios visibles de una viñeta, del más antiguo al más reciente (contrato del bloque 3, D4).
export async function listVisible(db: Queryable, panelId: number, page: { limit: number; offset: number }): Promise<{ total: number; comments: CommentRow[] }> {
  const count = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM comments c WHERE c.panel_id = $1 AND ${VISIBLE}`, [panelId]);
  const { rows } = await db.query<CommentDbRow>(
    `SELECT c.id, c.user_id, u.display_name AS author_name, c.body, c.created_at
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.panel_id = $1 AND ${VISIBLE}
     ORDER BY c.created_at, c.id
     LIMIT $2 OFFSET $3`,
    [panelId, page.limit, page.offset],
  );
  return { total: count.rows[0]?.total ?? 0, comments: rows.map(toRow) };
}

export async function insert(db: Queryable, panelId: number, userId: number, body: string): Promise<CommentRow> {
  const { rows } = await db.query<CommentDbRow>(
    `WITH inserted AS (
       INSERT INTO comments (panel_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, user_id, body, created_at
     )
     SELECT i.id, i.user_id, u.display_name AS author_name, i.body, i.created_at
     FROM inserted i JOIN users u ON u.id = i.user_id`,
    [panelId, userId, body],
  );
  return toRow(rows[0]!);
}

export interface CommentStateRow {
  id: number;
  userId: number;
  hiddenAt: Date | null;
  deletedAt: Date | null;
}

// Estado del comentario, bloqueado para decidir y cambiarlo en la misma transacción.
export async function findStateForUpdate(db: Queryable, id: number): Promise<CommentStateRow | null> {
  const { rows } = await db.query<{ id: number; user_id: number; hidden_at: Date | null; deleted_at: Date | null }>(
    'SELECT id, user_id, hidden_at, deleted_at FROM comments WHERE id = $1 FOR UPDATE',
    [id],
  );
  const row = rows[0];
  return row ? { id: row.id, userId: row.user_id, hiddenAt: row.hidden_at, deletedAt: row.deleted_at } : null;
}

export async function markDeleted(db: Queryable, id: number): Promise<Date> {
  const { rows } = await db.query<{ deleted_at: Date }>('UPDATE comments SET deleted_at = now() WHERE id = $1 RETURNING deleted_at', [id]);
  return rows[0]!.deleted_at;
}

// Contador por viñeta de un capítulo, sin columna guardada (consulta de modelo_datos.md). Posición → visibles.
export async function countVisibleByPosition(db: Queryable, chapterId: number): Promise<Map<number, number>> {
  const { rows } = await db.query<{ position: number; comments: number }>(
    `SELECT p.position, count(c.id)::int AS comments
     FROM panels p
     LEFT JOIN comments c ON c.panel_id = p.id AND ${VISIBLE}
     WHERE p.chapter_id = $1
     GROUP BY p.position`,
    [chapterId],
  );
  return new Map(rows.map((row) => [row.position, row.comments]));
}
