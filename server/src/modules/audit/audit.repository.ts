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
