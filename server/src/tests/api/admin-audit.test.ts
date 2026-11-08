import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createUser, RUN } from './reading-fixtures.js';

// Consulta de la auditoría (CU-40; contrato del bloque 4, D9) contra koma_test. Las entradas se escriben con el
// mismo servicio que usa la app, con un entityId propio de esta ejecución para no depender de otros tests.
const srv = startTestServer();

interface Entry {
  id: string;
  createdAt: string;
  actor: { id: number; displayName: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string;
}
interface AuditPage {
  entries: Entry[];
  page: number;
  pageSize: number;
  total: number;
}

const codeOf = async (res: Response) => `${res.status} ${((await res.json()) as { code: string }).code}`;
const search = async (cookie: string, query: string) =>
  (await (await api(srv, 'GET', `/api/admin/audit?${query}`, { cookie })).json()) as AuditPage;

async function record(action: 'comic.update' | 'system.seed', actorId: number | null, entityId: string, createdAt?: string) {
  const { pool } = await import('../../db/pool.js');
  // created_at no se puede cambiar después (solo inserción): para probar las fechas, la entrada nace con su hora.
  if (createdAt) {
    await pool.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, request_id, created_at) VALUES ($1, $2, 'comics', $3, $4, $5)`,
      [actorId, action, entityId, randomUUID(), createdAt],
    );
    return;
  }
  const audit = await import('../../modules/audit/audit.service.js');
  await audit.record(pool, { action, actorId, entityType: 'comics', entityId, before: { title: 'Antes' }, after: { title: 'Después' }, ip: '203.0.113.9', requestId: randomUUID() });
}

test('Seguridad: la auditoría solo la consulta el admin, y consultarla no escribe nada', async () => {
  assert.equal(await codeOf(await api(srv, 'GET', '/api/admin/audit')), '401 UNAUTHENTICATED');
  const author = await createUser('author');
  assert.equal(await codeOf(await api(srv, 'GET', '/api/admin/audit', { cookie: author.cookie })), '403 FORBIDDEN');
  const admin = await createUser('admin');
  const res = await api(srv, 'GET', '/api/admin/audit', { cookie: admin.cookie });
  assert.equal(res.status, 200);
  const { pool } = await import('../../db/pool.js');
  const { rows } = await pool.query('SELECT 1 FROM audit_log WHERE request_id = $1', [res.headers.get('x-request-id')]);
  assert.equal(rows.length, 0);
});

test('CU-40: filtra por entidad e id, por acción y por actor (correo sin distinguir mayúsculas); el sistema sale con actor null', async () => {
  const admin = await createUser('admin');
  const author = await createUser('author');
  const entityId = `audit-${RUN}-${randomUUID().slice(0, 8)}`;
  await record('comic.update', author.id, entityId);
  await record('system.seed', null, entityId);

  const byEntity = await search(admin.cookie, `entityType=comics&entityId=${entityId}`);
  assert.equal(byEntity.total, 2);
  assert.deepEqual(byEntity.entries.map((e) => e.action), ['system.seed', 'comic.update'], 'de la más reciente a la más antigua');
  const [system, update] = byEntity.entries as [Entry, Entry];
  assert.equal(system.actor, null);
  assert.deepEqual([update.actor?.id, update.actor?.displayName], [author.id, `author ${RUN}`]);
  assert.match(update.actor!.email, /^author-.*@lectura\.test$/);
  assert.deepEqual([update.before, update.after, update.ip], [{ title: 'Antes' }, { title: 'Después' }, '203.0.113.9']);
  assert.match(update.id, /^\d+$/);
  assert.match(update.requestId, /^[0-9a-f-]{36}$/);

  const byAction = await search(admin.cookie, `action=comic.update&entityType=comics&entityId=${entityId}`);
  assert.deepEqual(byAction.entries.map((e) => e.action), ['comic.update']);
  const byActor = await search(admin.cookie, `actor=${encodeURIComponent(update.actor!.email.toUpperCase())}&entityType=comics&entityId=${entityId}`);
  assert.deepEqual(byActor.entries.map((e) => e.action), ['comic.update']);
  const nobody = await search(admin.cookie, `actor=${encodeURIComponent(`nadie-${RUN}@demo.test`)}`);
  assert.equal(nobody.total, 0);
  assert.equal(byEntity.pageSize, 50);
});

test('CU-40: «desde» y «hasta» son días de Europe/Madrid con los dos extremos incluidos', async () => {
  const admin = await createUser('admin');
  const entityId = `fechas-${RUN}-${randomUUID().slice(0, 8)}`;
  // 2026-03-01 00:30 en Madrid es 2026-02-28 23:30 UTC; 2026-03-02 23:30 en Madrid es 22:30 UTC.
  await record('comic.update', null, entityId, '2026-02-28T23:30:00Z');
  await record('comic.update', null, entityId, '2026-03-02T22:30:00Z');
  await record('comic.update', null, entityId, '2026-03-02T23:30:00Z'); // ya es 3 de marzo en Madrid
  const base = `entityType=comics&entityId=${entityId}`;
  assert.equal((await search(admin.cookie, `${base}&from=2026-03-01&to=2026-03-02`)).total, 2);
  assert.equal((await search(admin.cookie, `${base}&from=2026-03-03`)).total, 1, 'la del 3 de marzo en Madrid');
  assert.equal((await search(admin.cookie, `${base}&to=2026-02-28`)).total, 0);
  assert.equal((await search(admin.cookie, `${base}&from=2026-03-01&to=2026-03-01`)).total, 1);
});

test('Seguridad: filtros no válidos dan 400 con fields', async () => {
  const admin = await createUser('admin');
  const cases: [string, string][] = [
    ['action=comic.borrar', 'action'],
    ['entityType=passwords', 'entityType'],
    ['entityId=7', 'entityId'],
    [`entityType=comics&entityId=${'x'.repeat(41)}`, 'entityId'],
    ['actor=no-es-correo', 'actor'],
    ['from=2026-13-01', 'from'],
    ['from=2026-03-02&to=2026-03-01', 'to'],
    ['page=0', 'page'],
  ];
  for (const [query, field] of cases) {
    const res = await api(srv, 'GET', `/api/admin/audit?${query}`, { cookie: admin.cookie });
    assert.equal(res.status, 400, query);
    assert.ok(((await res.json()) as { fields: Record<string, string> }).fields[field], `${field} en ${query}`);
  }
});
