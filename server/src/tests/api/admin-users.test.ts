import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createUser, RUN } from './reading-fixtures.js';

// Gestión de usuarios (CU-35; RN-14, RN-15; contrato del bloque 4) contra koma_test. La regla de "al menos un admin
// activo" con dos admins a la vez está en tests/unit/permissions.test.ts: aquí otros archivos crean admins en paralelo.
const srv = startTestServer();
const db = async () => (await import('../../db/pool.js')).pool;

interface AdminUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
  isAuthor: boolean;
  status: string;
  isPremium: boolean;
  premiumUntil: string | null;
  createdAt: string;
  isSelf: boolean;
}

const codeOf = async (res: Response) => `${res.status} ${((await res.json()) as { code: string }).code}`;
const patch = (cookie: string, id: number, body: unknown) => api(srv, 'PATCH', `/api/admin/users/${id}`, { cookie, body });
const me = async (cookie: string) => ((await (await api(srv, 'GET', '/api/me', { cookie })).json()) as { user: { id: number } | null }).user;

async function auditOf(res: Response) {
  const { rows } = await (await db()).query<{ action: string; actor_id: number; entity_id: string; before: unknown; after: unknown }>(
    'SELECT action, actor_id, entity_id, before, after FROM audit_log WHERE request_id = $1',
    [res.headers.get('x-request-id')],
  );
  return rows;
}

test('RN-14: la lista busca por correo y nombre, filtra por rol y estado, marca isSelf y no expone datos sensibles', async () => {
  const admin = await createUser('admin');
  const author = await createUser('author');
  const res = await api(srv, 'GET', `/api/admin/users?q=${encodeURIComponent(`-${RUN}-`)}&role=author`, { cookie: admin.cookie });
  assert.equal(res.status, 200);
  const page = (await res.json()) as { users: AdminUser[]; page: number; pageSize: number; total: number };
  assert.ok(page.users.length >= 1 && page.users.every((u) => u.isAuthor));
  const found = page.users.find((u) => u.id === author.id)!;
  assert.deepEqual(Object.keys(found).sort(), ['createdAt', 'displayName', 'email', 'id', 'isAuthor', 'isPremium', 'isSelf', 'premiumUntil', 'role', 'status']);
  assert.equal(found.isSelf, false);
  const self = (await (await api(srv, 'GET', `/api/admin/users?q=${encodeURIComponent(`admin-${RUN}`)}&role=admin`, { cookie: admin.cookie })).json()) as {
    users: AdminUser[];
  };
  assert.equal(self.users.find((u) => u.id === admin.id)?.isSelf, true);
  const readers = (await (await api(srv, 'GET', `/api/admin/users?role=user&q=${encodeURIComponent(RUN)}`, { cookie: admin.cookie })).json()) as {
    users: AdminUser[];
  };
  assert.ok(readers.users.every((u) => u.role === 'user' && !u.isAuthor));
  for (const query of ['?role=autor', '?status=borrado', '?page=0', `?q=${'x'.repeat(101)}`]) {
    assert.equal(await codeOf(await api(srv, 'GET', `/api/admin/users${query}`, { cookie: admin.cookie })), '400 VALIDATION_ERROR', query);
  }
});

test('RN-14: el admin no cambia su propio rol ni su estado (403)', async () => {
  const admin = await createUser('admin');
  assert.equal(await codeOf(await patch(admin.cookie, admin.id, { role: 'user' })), '403 FORBIDDEN');
  assert.equal(await codeOf(await patch(admin.cookie, admin.id, { status: 'suspended' })), '403 FORBIDDEN');
});

test('RN-15: suspender cierra las sesiones de la cuenta y audita user.suspend; reactivar, user.reactivate', async () => {
  const admin = await createUser('admin');
  const reader = await createUser('reader');
  assert.equal((await me(reader.cookie))?.id, reader.id);
  const res = await patch(admin.cookie, reader.id, { status: 'suspended' });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { user: AdminUser }).user.status, 'suspended');
  assert.deepEqual(await auditOf(res), [
    { action: 'user.suspend', actor_id: admin.id, entity_id: String(reader.id), before: { status: 'active' }, after: { status: 'suspended' } },
  ]);
  assert.equal(await me(reader.cookie), null, 'su sesión ya no vale');
  assert.equal(await codeOf(await patch(admin.cookie, reader.id, { status: 'suspended' })), '409 CONFLICT');
  const back = await patch(admin.cookie, reader.id, { status: 'active' });
  assert.equal(back.status, 200);
  assert.equal((await auditOf(back))[0]?.action, 'user.reactivate');
  assert.equal(await me(reader.cookie), null, 'la sesión antigua sigue sin valer (token_version)');
});

test('RN-15: cambiar el rol audita user.role_change y cierra sesiones; el rol de autor no las cierra (D8)', async () => {
  const admin = await createUser('admin');
  const reader = await createUser('reader');
  const promote = await patch(admin.cookie, reader.id, { role: 'admin' });
  assert.equal(promote.status, 200);
  assert.deepEqual((await auditOf(promote))[0]?.after, { role: 'admin' });
  assert.equal(await me(reader.cookie), null);
  const demote = await patch(admin.cookie, reader.id, { role: 'user' });
  assert.equal(demote.status, 200);
  assert.deepEqual((await auditOf(demote))[0]?.before, { role: 'admin' });

  const other = await createUser('reader');
  const grant = await patch(admin.cookie, other.id, { isAuthor: true });
  assert.equal(grant.status, 200);
  assert.deepEqual(await auditOf(grant), [
    { action: 'user.author_grant', actor_id: admin.id, entity_id: String(other.id), before: { isAuthor: false }, after: { isAuthor: true } },
  ]);
  assert.equal((await api(srv, 'GET', '/api/author/comics', { cookie: other.cookie })).status, 200, 'misma sesión, ya autor');
  const revoke = await patch(admin.cookie, other.id, { isAuthor: false });
  assert.equal((await auditOf(revoke))[0]?.action, 'user.author_revoke');
  assert.equal((await api(srv, 'GET', '/api/author/comics', { cookie: other.cookie })).status, 403, 'misma sesión, ya no es autor');
  // Ninguna entrada guarda token_version.
  const { rows } = await (await db()).query<{ n: number }>(
    `SELECT count(*)::int AS n FROM audit_log WHERE entity_type = 'users' AND entity_id = $1 AND (before::text ILIKE '%token%' OR after::text ILIKE '%token%')`,
    [String(reader.id)],
  );
  assert.equal(rows[0]!.n, 0);
});

test('RN-14: un admin no es autor (409, D7); el mismo valor da 409; uno inexistente, 404', async () => {
  const admin = await createUser('admin');
  const author = await createUser('author');
  const otherAdmin = await createUser('admin');
  assert.equal(await codeOf(await patch(admin.cookie, author.id, { role: 'admin' })), '409 CONFLICT');
  assert.equal(await codeOf(await patch(admin.cookie, otherAdmin.id, { isAuthor: true })), '409 CONFLICT');
  assert.equal(await codeOf(await patch(admin.cookie, author.id, { isAuthor: true })), '409 CONFLICT');
  assert.equal(await codeOf(await patch(admin.cookie, 2147483647, { status: 'suspended' })), '404 NOT_FOUND');
  assert.equal(await codeOf(await patch(admin.cookie, 0, { status: 'suspended' })), '404 NOT_FOUND');
});

test('Seguridad: el cuerpo lleva exactamente uno de role, isAuthor o status; nada más', async () => {
  const admin = await createUser('admin');
  const reader = await createUser('reader');
  for (const body of [{}, { role: 'admin', status: 'suspended' }, { role: 'superadmin' }, { isAuthor: 'sí' }, { email: 'x@y.z' }, { role: 'admin', tokenVersion: 0 }]) {
    assert.equal(await codeOf(await patch(admin.cookie, reader.id, body)), '400 VALIDATION_ERROR', JSON.stringify(body));
  }
  const author = await createUser('author');
  assert.equal(await codeOf(await patch(author.cookie, reader.id, { status: 'suspended' })), '403 FORBIDDEN');
});
