import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newImageKey } from '../../utils/image.js';
import { api, startTestServer } from './helpers.js';
import { createUser, RUN, type TestUser } from './reading-fixtures.js';

// Admin: revisión de las ilustraciones de la comunidad (CU-32; RN-22; contrato del bloque 6, D9) contra koma_test.
const srv = startTestServer();
const db = async () => (await import('../../db/pool.js')).pool;

interface AdminIllustration {
  id: number;
  title: string;
  status: string;
  rejectionReason: string | null;
  publishedAt: string | null;
  createdAt: string;
  url: string;
  tags: string[];
  author: { id: number; displayName: string };
}
interface AdminList {
  illustrations: AdminIllustration[];
  page: number;
  pageSize: number;
  total: number;
}

const codeOf = async (res: Response) => `${res.status} ${((await res.json()) as { code: string }).code}`;

async function auditOf(res: Response) {
  const { rows } = await (await db()).query<{ action: string; actor_id: number; entity_type: string; entity_id: string; before: unknown; after: unknown }>(
    'SELECT action, actor_id, entity_type, entity_id, before, after FROM audit_log WHERE request_id = $1',
    [res.headers.get('x-request-id')],
  );
  return rows;
}

let created = 0;
async function seed(userId: number, spec: { status?: 'pending' | 'approved' | 'rejected'; withdrawn?: boolean; createdAt?: string; tag?: string } = {}): Promise<number> {
  const status = spec.status ?? 'pending';
  const pool = await db();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO illustrations (user_id, title, image_key, width, height, status, rejection_reason, published_at, deleted_at, created_at)
     VALUES ($1, $2, $3, 600, 900, $4::text, CASE WHEN $4::text = 'rejected' THEN 'Motivo' END,
             CASE WHEN $4::text = 'approved' THEN now() END, CASE WHEN $5::boolean THEN now() END, COALESCE($6::timestamptz, now()))
     RETURNING id`,
    [userId, `Revisión ${RUN} ${++created}`, newImageKey('png'), status, spec.withdrawn ?? false, spec.createdAt ?? null],
  );
  if (spec.tag) await pool.query('INSERT INTO illustration_tags (illustration_id, tag) VALUES ($1, $2)', [rows[0]!.id, spec.tag]);
  return rows[0]!.id;
}

async function list(admin: TestUser, query: string): Promise<AdminList> {
  const res = await api(srv, 'GET', `/api/admin/illustrations${query}`, { cookie: admin.cookie });
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as AdminList;
}

// Todas las de un estado, recorriendo las páginas (otros archivos de test también crean ilustraciones).
async function listAll(admin: TestUser, status: string): Promise<AdminIllustration[]> {
  const all: AdminIllustration[] = [];
  for (let page = 1; ; page++) {
    const result = await list(admin, `?status=${status}&page=${page}`);
    all.push(...result.illustrations);
    if (all.length >= result.total || result.illustrations.length === 0) return all;
  }
}

const approve = (id: number | string, user: TestUser | null) => api(srv, 'POST', `/api/admin/illustrations/${id}/approve`, { ...(user && { cookie: user.cookie }) });
const reject = (id: number | string, user: TestUser | null, body: unknown = { reason: 'No cumple las normas' }) =>
  api(srv, 'POST', `/api/admin/illustrations/${id}/reject`, { body, ...(user && { cookie: user.cookie }) });

test('Seguridad: la revisión de ilustraciones exige sesión (401) y rol admin (403), también un lector, un premium y un autor', async () => {
  const owner = await createUser('reader');
  const id = await seed(owner.id);
  assert.equal(await codeOf(await api(srv, 'GET', '/api/admin/illustrations?status=pending')), '401 UNAUTHENTICATED');
  assert.equal(await codeOf(await approve(id, null)), '401 UNAUTHENTICATED');
  for (const kind of ['reader', 'premium', 'author'] as const) {
    const user = await createUser(kind);
    assert.equal(await codeOf(await api(srv, 'GET', '/api/admin/illustrations?status=pending', { cookie: user.cookie })), '403 FORBIDDEN', kind);
    assert.equal(await codeOf(await approve(id, user)), '403 FORBIDDEN', kind);
    assert.equal(await codeOf(await reject(id, user)), '403 FORBIDDEN', kind);
  }
  // Ni su dueño la aprueba.
  assert.equal(await codeOf(await approve(id, owner)), '403 FORBIDDEN');
  const { rows } = await (await db()).query<{ status: string }>('SELECT status FROM illustrations WHERE id = $1', [id]);
  assert.equal(rows[0]!.status, 'pending');
});

test('RN-22: la lista del admin trae las pendientes de la más antigua a la más reciente, con su autor (id y nombre); sin las retiradas ni las de otro estado', async () => {
  const admin = await createUser('admin');
  const owner = await createUser('author');
  const newer = await seed(owner.id, { createdAt: '2026-01-02T10:00:00Z', tag: 'boceto' });
  const older = await seed(owner.id, { createdAt: '2026-01-01T10:00:00Z' });
  const withdrawn = await seed(owner.id, { withdrawn: true });
  const approved = await seed(owner.id, { status: 'approved' });
  const rejected = await seed(owner.id, { status: 'rejected' });

  const first = await list(admin, '?status=pending');
  assert.equal(first.page, 1);
  assert.equal(first.pageSize, 50);
  const pending = await listAll(admin, 'pending');
  const ids = pending.map((item) => item.id);
  assert.ok(ids.indexOf(older) !== -1 && ids.indexOf(older) < ids.indexOf(newer), 'la más antigua va antes');
  for (const id of [withdrawn, approved, rejected]) assert.ok(!ids.includes(id));
  const item = pending.find((entry) => entry.id === newer)!;
  assert.deepEqual(item.author, { id: owner.id, displayName: `author ${RUN}` });
  assert.equal(item.status, 'pending');
  assert.deepEqual(item.tags, ['boceto']);
  assert.match(item.url, /\.png\?/);
  assert.equal(item.createdAt, '2026-01-02T10:00:00.000Z');

  const published = (await listAll(admin, 'approved')).map((entry) => entry.id);
  assert.ok(published.includes(approved));
  for (const id of [newer, older, withdrawn, rejected]) assert.ok(!published.includes(id));
});

test('RN-22: la lista del admin rechaza con 400 un estado o una página no válidos', async () => {
  const admin = await createUser('admin');
  for (const query of ['?status=rejected', '?status=todo', '?status=pending&status=approved', '?status=pending&page=0', '?status=pending&page=x']) {
    assert.equal(await codeOf(await api(srv, 'GET', `/api/admin/illustrations${query}`, { cookie: admin.cookie })), '400 VALIDATION_ERROR', query);
  }
});

test('RN-22: aprobar pasa la ilustración de pending a approved con published_at, la hace pública y lo audita; otra vez es 409', async () => {
  const admin = await createUser('admin');
  const owner = await createUser('reader');
  const tag = `a${RUN}-ok`;
  const id = await seed(owner.id, { tag });
  const hidden = (await (await api(srv, 'GET', `/api/illustrations?tag=${tag}`)).json()) as { total: number };
  assert.equal(hidden.total, 0);

  const res = await approve(id, admin);
  assert.equal(res.status, 204);
  const { rows } = await (await db()).query<{ status: string; published_at: Date | null }>('SELECT status, published_at FROM illustrations WHERE id = $1', [id]);
  assert.equal(rows[0]!.status, 'approved');
  assert.ok(rows[0]!.published_at);
  const audit = await auditOf(res);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]!.action, 'illustration.approve');
  assert.equal(audit[0]!.actor_id, admin.id);
  assert.equal(audit[0]!.entity_type, 'illustrations');
  assert.equal(audit[0]!.entity_id, String(id));
  assert.deepEqual(audit[0]!.before, { status: 'pending', publishedAt: null });
  assert.deepEqual(audit[0]!.after, { status: 'approved', publishedAt: rows[0]!.published_at!.toISOString() });

  const visible = (await (await api(srv, 'GET', `/api/illustrations?tag=${tag}`)).json()) as { illustrations: { id: number; publishedAt: string }[] };
  assert.deepEqual(visible.illustrations.map((item) => item.id), [id]);
  assert.equal(visible.illustrations[0]!.publishedAt, rows[0]!.published_at!.toISOString());

  assert.equal(await codeOf(await approve(id, admin)), '409 CONFLICT');
  assert.equal(await codeOf(await reject(id, admin)), '409 CONFLICT');
});

test('RN-22: rechazar exige motivo de 1 a 500 caracteres (400 en fields.reason); el dueño lo ve en «Mis ilustraciones» y queda auditado; otra vez es 409', async () => {
  const admin = await createUser('admin');
  const owner = await createUser('reader');
  const id = await seed(owner.id);
  for (const body of [{}, { reason: '   ' }, { reason: 'a'.repeat(501) }, { reason: 7 }]) {
    const res = await reject(id, admin, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok(((await res.json()) as { fields?: Record<string, string> }).fields?.['reason']);
  }
  const res = await reject(id, admin, { reason: '  Contenido +18: no se admite  ' });
  assert.equal(res.status, 204);
  const audit = await auditOf(res);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]!.action, 'illustration.reject');
  assert.deepEqual(audit[0]!.before, { status: 'pending', rejectionReason: null });
  assert.deepEqual(audit[0]!.after, { status: 'rejected', rejectionReason: 'Contenido +18: no se admite' });

  const mine = (await (await api(srv, 'GET', '/api/me/illustrations', { cookie: owner.cookie })).json()) as { illustrations: { id: number; status: string; rejectionReason: string | null }[] };
  const own = mine.illustrations.find((item) => item.id === id)!;
  assert.equal(own.status, 'rejected');
  assert.equal(own.rejectionReason, 'Contenido +18: no se admite');

  assert.equal(await codeOf(await reject(id, admin)), '409 CONFLICT');
  assert.equal(await codeOf(await approve(id, admin)), '409 CONFLICT');
});

test('RN-22: aprobar o rechazar una ilustración retirada es 409 y una que no existe, 404; no se audita nada', async () => {
  const admin = await createUser('admin');
  const owner = await createUser('reader');
  const withdrawn = await seed(owner.id, { withdrawn: true });
  for (const res of [await approve(withdrawn, admin), await reject(withdrawn, admin)]) {
    assert.equal(res.status, 409);
    assert.deepEqual(await auditOf(res), []);
  }
  for (const id of [2_000_000_000, 'abc', '0', '1.5']) {
    assert.equal(await codeOf(await approve(id, admin)), '404 NOT_FOUND', String(id));
    assert.equal(await codeOf(await reject(id, admin)), '404 NOT_FOUND', String(id));
  }
});
