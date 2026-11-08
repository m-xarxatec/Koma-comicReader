import type { Queryable } from '../../db/pool.js';

// Único lugar con SQL de `audit_log` (solo inserción: los triggers impiden UPDATE, DELETE y TRUNCATE).

export interface AuditRow {
  actorId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: object | null;
  after: object | null;
  ip: string | null;
  requestId: string;
}

interface AuditDbRow {
  actor_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: object | null;
  after: object | null;
  ip: string | null;
  request_id: string;
}

// Entradas de una petición: el request_id une la auditoría con los logs (depuración y tests).
export async function findByRequestId(db: Queryable, requestId: string): Promise<AuditRow[]> {
  const { rows } = await db.query<AuditDbRow>(
    `SELECT actor_id, action, entity_type, entity_id, before, after, host(ip) AS ip, request_id
     FROM audit_log WHERE request_id = $1 ORDER BY id`,
    [requestId],
  );
  return rows.map((row) => ({
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: row.before,
    after: row.after,
    ip: row.ip,
    requestId: row.request_id,
  }));
}

export async function insert(db: Queryable, row: AuditRow): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, before, after, ip, request_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::inet, $8)`,
    [
      row.actorId,
      row.action,
      row.entityType,
      row.entityId,
      row.before === null ? null : JSON.stringify(row.before),
      row.after === null ? null : JSON.stringify(row.after),
      row.ip,
      row.requestId,
    ],
  );
}

// --- Bloque 4: consulta del admin (CU-40) ---

export interface AuditSearch {
  actorEmail: string | null; // exacto, sin distinguir mayúsculas
  action: string | null;
  entityType: string | null;
  entityId: string | null;
  from: string | null; // 'YYYY-MM-DD', día de Europe/Madrid incluido
  to: string | null; // ídem
  limit: number;
  offset: number;
}

export interface AuditListRow {
  id: string; // BIGINT: pg lo devuelve como texto
  createdAt: Date;
  actor: { id: number; displayName: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string;
}

// Filtros combinables con Y. Las fechas, como días de Europe/Madrid: desde el inicio de `from` hasta el final de `to`.
// Fragmento fijo; los datos van en $1 a $6.
const SEARCH_WHERE = `($1::text IS NULL OR lower(u.email) = lower($1))
  AND ($2::text IS NULL OR a.action = $2)
  AND ($3::text IS NULL OR a.entity_type = $3)
  AND ($4::text IS NULL OR a.entity_id = $4)
  AND ($5::date IS NULL OR a.created_at >= ($5::date)::timestamp AT TIME ZONE 'Europe/Madrid')
  AND ($6::date IS NULL OR a.created_at < ($6::date + 1)::timestamp AT TIME ZONE 'Europe/Madrid')`;

export async function search(db: Queryable, filter: AuditSearch): Promise<{ total: number; entries: AuditListRow[] }> {
  const params = [filter.actorEmail, filter.action, filter.entityType, filter.entityId, filter.from, filter.to];
  const count = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE ${SEARCH_WHERE}`,
    params,
  );
  const { rows } = await db.query<{
    id: string;
    created_at: Date;
    actor_id: number | null;
    display_name: string | null;
    email: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    before: unknown;
    after: unknown;
    ip: string | null;
    request_id: string;
  }>(
    `SELECT a.id, a.created_at, a.actor_id, u.display_name, u.email, a.action, a.entity_type, a.entity_id, a.before, a.after,
            host(a.ip) AS ip, a.request_id
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
     WHERE ${SEARCH_WHERE}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $7 OFFSET $8`,
    [...params, filter.limit, filter.offset],
  );
  return {
    total: count.rows[0]?.total ?? 0,
    entries: rows.map((row) => ({
      id: String(row.id),
      createdAt: row.created_at,
      actor: row.actor_id !== null && row.display_name !== null && row.email !== null ? { id: row.actor_id, displayName: row.display_name, email: row.email } : null,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      before: row.before,
      after: row.after,
      ip: row.ip,
      requestId: row.request_id,
    })),
  };
}
