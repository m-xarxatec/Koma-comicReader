import type { Queryable } from '../../db/pool.js';

// Único lugar con SQL de `illustrations` e `illustration_tags` (migración 010). snake_case en la BD, camelCase
// hacia fuera. "Pública" = aprobada y no retirada (RN-22).

export type IllustrationStatus = 'pending' | 'approved' | 'rejected';

export interface IllustrationRow {
  id: number;
  userId: number;
  authorName: string;
  title: string;
  description: string | null;
  imageKey: string; // nunca sale del servidor: la URL se firma en el servicio
  width: number;
  height: number;
  status: IllustrationStatus;
  rejectionReason: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  tags: string[]; // en orden alfabético
}

interface IllustrationDbRow {
  id: number;
  user_id: number;
  author_name: string;
  title: string;
  description: string | null;
  image_key: string;
  width: number;
  height: number;
  status: IllustrationStatus;
  rejection_reason: string | null;
  published_at: Date | null;
  created_at: Date;
  tags: string[];
}

const toRow = (row: IllustrationDbRow): IllustrationRow => ({
  id: row.id,
  userId: row.user_id,
  authorName: row.author_name,
  title: row.title,
  description: row.description,
  imageKey: row.image_key,
  width: row.width,
  height: row.height,
  status: row.status,
  rejectionReason: row.rejection_reason,
  publishedAt: row.published_at,
  createdAt: row.created_at,
  tags: row.tags,
});

const SELECT = `SELECT i.id, i.user_id, u.display_name AS author_name, i.title, i.description, i.image_key, i.width, i.height,
                       i.status, i.rejection_reason, i.published_at, i.created_at,
                       COALESCE((SELECT array_agg(t.tag ORDER BY t.tag) FROM illustration_tags t WHERE t.illustration_id = i.id), '{}') AS tags
                FROM illustrations i JOIN users u ON u.id = i.user_id`;
const PUBLIC = "i.status = 'approved' AND i.deleted_at IS NULL";

export interface Page {
  limit: number;
  offset: number;
}

export interface IllustrationList {
  total: number;
  illustrations: IllustrationRow[];
}

async function list(db: Queryable, where: string, params: unknown[], orderBy: string, page: Page): Promise<IllustrationList> {
  const count = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM illustrations i WHERE ${where}`, params);
  const { rows } = await db.query<IllustrationDbRow>(
    `${SELECT} WHERE ${where} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.limit, page.offset],
  );
  return { total: count.rows[0]?.total ?? 0, illustrations: rows.map(toRow) };
}

// Tablero público: de la más reciente a la más antigua; `tag` filtra por una sola etiqueta. La cuenta de quien la
// publicó no se mira: la de un suspendido sigue visible (RN-15).
export function listPublic(db: Queryable, tag: string | null, page: Page): Promise<IllustrationList> {
  return list(
    db,
    `${PUBLIC} AND ($1::text IS NULL OR EXISTS (SELECT 1 FROM illustration_tags t WHERE t.illustration_id = i.id AND t.tag = $1::text))`,
    [tag],
    'i.published_at DESC, i.id DESC',
    page,
  );
}

// Etiquetas más usadas entre las ilustraciones públicas (a igual uso, por orden alfabético).
export async function listTopTags(db: Queryable, limit: number): Promise<{ tag: string; count: number }[]> {
  const { rows } = await db.query<{ tag: string; count: number }>(
    `SELECT t.tag, count(*)::int AS count
     FROM illustration_tags t JOIN illustrations i ON i.id = t.illustration_id
     WHERE ${PUBLIC}
     GROUP BY t.tag
     ORDER BY count DESC, t.tag
     LIMIT $1`,
    [limit],
  );
  return rows;
}

// «Mis ilustraciones»: las propias en cualquier estado, sin las retiradas, de la más reciente a la más antigua.
export function listOwn(db: Queryable, userId: number, page: Page): Promise<IllustrationList> {
  return list(db, 'i.user_id = $1 AND i.deleted_at IS NULL', [userId], 'i.created_at DESC, i.id DESC', page);
}

// Admin (D9): pendientes de la más antigua a la más reciente (la que más espera, primero); publicadas, de la más
// reciente a la más antigua. Sin las retiradas.
export function listForAdmin(db: Queryable, status: 'pending' | 'approved', page: Page): Promise<IllustrationList> {
  const orderBy = status === 'pending' ? 'i.created_at, i.id' : 'i.published_at DESC, i.id DESC';
  return list(db, 'i.status = $1 AND i.deleted_at IS NULL', [status], orderBy, page);
}

export async function findById(db: Queryable, id: number): Promise<IllustrationRow | null> {
  const { rows } = await db.query<IllustrationDbRow>(`${SELECT} WHERE i.id = $1`, [id]);
  return rows[0] ? toRow(rows[0]) : null;
}

export interface IllustrationState {
  id: number;
  userId: number;
  status: IllustrationStatus;
  deletedAt: Date | null;
}

// Estado de la ilustración, con su fila bloqueada para decidir y cambiarla en la misma transacción.
export async function findStateForUpdate(db: Queryable, id: number): Promise<IllustrationState | null> {
  const { rows } = await db.query<{ id: number; user_id: number; status: IllustrationStatus; deleted_at: Date | null }>(
    'SELECT id, user_id, status, deleted_at FROM illustrations WHERE id = $1 FOR UPDATE',
    [id],
  );
  const row = rows[0];
  return row ? { id: row.id, userId: row.user_id, status: row.status, deletedAt: row.deleted_at } : null;
}

// Bloquea la fila del usuario: dos altas a la vez del mismo usuario pasan una detrás de otra y el tope de pendientes
// no se supera (modelo_datos.md, 010).
export async function lockUser(db: Queryable, userId: number): Promise<void> {
  await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
}

// Pendientes de revisión de un usuario (sin las retiradas).
export async function countPending(db: Queryable, userId: number): Promise<number> {
  const { rows } = await db.query<{ total: number }>(
    "SELECT count(*)::int AS total FROM illustrations WHERE user_id = $1 AND status = 'pending' AND deleted_at IS NULL",
    [userId],
  );
  return rows[0]?.total ?? 0;
}

export interface NewIllustration {
  userId: number;
  title: string;
  description: string | null;
  imageKey: string;
  width: number;
  height: number;
  tags: readonly string[];
}

// Nace `pending` (valor por defecto de la columna). Devuelve su id.
export async function insert(db: Queryable, input: NewIllustration): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    'INSERT INTO illustrations (user_id, title, description, image_key, width, height) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [input.userId, input.title, input.description, input.imageKey, input.width, input.height],
  );
  const id = rows[0]!.id;
  if (input.tags.length > 0) {
    await db.query('INSERT INTO illustration_tags (illustration_id, tag) SELECT $1, unnest($2::text[])', [id, input.tags]);
  }
  return id;
}

// Retirada lógica. Devuelve el instante guardado (para la auditoría).
export async function withdraw(db: Queryable, id: number): Promise<Date> {
  const { rows } = await db.query<{ deleted_at: Date }>('UPDATE illustrations SET deleted_at = now() WHERE id = $1 RETURNING deleted_at', [id]);
  return rows[0]!.deleted_at;
}

// Aprobar fija published_at. Devuelve el instante guardado (para la auditoría).
export async function approve(db: Queryable, id: number): Promise<Date> {
  const { rows } = await db.query<{ published_at: Date }>(
    "UPDATE illustrations SET status = 'approved', published_at = now() WHERE id = $1 RETURNING published_at",
    [id],
  );
  return rows[0]!.published_at;
}

export async function reject(db: Queryable, id: number, reason: string): Promise<void> {
  await db.query("UPDATE illustrations SET status = 'rejected', rejection_reason = $2 WHERE id = $1", [id, reason]);
}
