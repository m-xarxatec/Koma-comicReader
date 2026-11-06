import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { api, sessionCookie, sessionSetCookie, startTestServer } from './helpers.js';

// Perfil (CU-23; RN-12, RN-13, RN-15; contrato del bloque 3) contra koma_test.
const srv = startTestServer();

const RUN = randomBytes(3).toString('hex');
const PASSWORD = 'contraseña-actual-1';
const db = async () => (await import('../../db/pool.js')).pool;

interface ProfileUser {
  id: number;
  email: string;
  cookie: string;
}

let users = 0;
// Cuenta con contraseña de verdad (el login y el cambio la comprueban con bcrypt) y su sesión.
async function createAccount(displayName = `Perfil ${RUN}`): Promise<ProfileUser> {
  users++;
  const { hashPassword } = await import('../../utils/password.js');
  const { signSession } = await import('../../modules/auth/auth.service.js');
  const email = `perfil-${RUN}-${users}@perfil.test`;
  const { rows } = await (await db()).query<{ id: number; token_version: number }>(
    `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, token_version`,
    [email, await hashPassword(PASSWORD), displayName],
  );
  const row = rows[0]!;
  return { id: row.id, email, cookie: `koma_session=${signSession({ id: row.id, tokenVersion: row.token_version })}` };
}

async function auditOf(res: Response) {
  const { findByRequestId } = await import('../../modules/audit/audit.repository.js');
  return findByRequestId(await db(), res.headers.get('x-request-id') ?? '');
}

const patchMe = (user: ProfileUser | null, body: unknown) => api(srv, 'PATCH', '/api/me', { body, ...(user && { cookie: user.cookie }) });
const changePassword = (user: ProfileUser | null, body: unknown, cookie = user?.cookie) =>
  api(srv, 'POST', '/api/auth/password', { body, ...(cookie && { cookie }) });
const me = async (cookie: string) => ((await (await api(srv, 'GET', '/api/me', { cookie })).json()) as { user: { id: number } | null }).user;

async function assertError(res: Response, status: number, code: string, field?: string) {
  assert.equal(res.status, status);
  const body = (await res.json()) as { code: string; fields?: Record<string, string> };
  assert.equal(body.code, code);
  if (field) assert.ok(body.fields?.[field], `fields.${field} en ${JSON.stringify(body.fields)}`);
  return body;
}

async function storedUser(id: number) {
  const { rows } = await (await db()).query<{ display_name: string; password_hash: string; token_version: number }>(
    'SELECT display_name, password_hash, token_version FROM users WHERE id = $1',
    [id],
  );
  return rows[0]!;
}

// ── Nombre visible ────────────────────────────────────────────────────────────

test('RN-12: PATCH /api/me cambia el nombre visible (recortado) y audita user.update_profile con antes y después', async () => {
  const user = await createAccount();
  const res = await patchMe(user, { displayName: '  Nuevo Nombre  ' });
  assert.equal(res.status, 200);
  const { user: dto } = (await res.json()) as { user: Record<string, unknown> };
  assert.deepEqual(Object.keys(dto).sort(), ['displayName', 'email', 'id', 'isAuthor', 'isPremium', 'premiumUntil', 'role']);
  assert.equal(dto['displayName'], 'Nuevo Nombre');
  assert.equal((await storedUser(user.id)).display_name, 'Nuevo Nombre');

  const [entry, ...rest] = await auditOf(res);
  assert.equal(rest.length, 0);
  assert.equal(entry?.action, 'user.update_profile');
  assert.equal(entry?.actorId, user.id);
  assert.equal(entry?.entityType, 'users');
  assert.equal(entry?.entityId, String(user.id));
  assert.deepEqual(entry?.before, { displayName: `Perfil ${RUN}` });
  assert.deepEqual(entry?.after, { displayName: 'Nuevo Nombre' });
});

test('RN-12: el mismo nombre responde 200 sin escribir en la auditoría', async () => {
  const user = await createAccount();
  const res = await patchMe(user, { displayName: ` Perfil ${RUN} ` });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { user: { displayName: string } }).user.displayName, `Perfil ${RUN}`);
  assert.deepEqual(await auditOf(res), []);
});

test('RN-12: el nombre cuenta de 3 a 30 puntos de código; fuera de rango o ausente, 400 en fields.displayName', async () => {
  const user = await createAccount();
  for (const displayName of ['ab', '  ab  ', 'x'.repeat(31), '😀'.repeat(31), undefined, 42]) {
    await assertError(await patchMe(user, { displayName }), 400, 'VALIDATION_ERROR', 'displayName');
  }
  // 30 emojis son 60 unidades UTF-16, pero 30 caracteres.
  assert.equal((await patchMe(user, { displayName: '😀'.repeat(30) })).status, 200);
  assert.equal((await patchMe(user, { displayName: 'abc' })).status, 200);
  assert.equal((await storedUser(user.id)).display_name, 'abc');
});

test('Seguridad: el nombre visible no admite caracteres de control, ni en el perfil ni en el registro', async () => {
  const user = await createAccount();
  for (const displayName of ['Ana\u0000', 'An\u0007a', 'Ana\nLópez', 'Ana\u007f']) {
    const body = await assertError(await patchMe(user, { displayName }), 400, 'VALIDATION_ERROR', 'displayName');
    assert.equal(body.fields?.['displayName'], 'Contiene caracteres no válidos', JSON.stringify(displayName));
    // Un 400 de validación no cuenta para el límite de registro (RN-13) ni crea la cuenta.
    const email = `control-${RUN}-${users}@perfil.test`;
    const register = await api(srv, 'POST', '/api/auth/register', { body: { email, password: 'una-contraseña-larga', displayName } });
    const registerBody = await assertError(register, 400, 'VALIDATION_ERROR', 'displayName');
    assert.equal(registerBody.fields?.['displayName'], 'Contiene caracteres no válidos');
  }
  assert.equal((await storedUser(user.id)).display_name, `Perfil ${RUN}`);
  // Los espacios y tabuladores de los extremos se recortan antes de comprobar.
  assert.equal((await patchMe(user, { displayName: '\tAna López ' })).status, 200);
  assert.equal((await storedUser(user.id)).display_name, 'Ana López');
});

test('Seguridad: el correo no se edita desde PATCH /api/me', async () => {
  const user = await createAccount();
  const res = await patchMe(user, { displayName: 'Con Correo', email: 'otro@perfil.test' });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { user: { email: string } }).user.email, user.email);
});

// ── Contraseña ────────────────────────────────────────────────────────────────

test('RN-15: cambiar la contraseña da 200 con cookie nueva; la sesión anterior deja de valer y la nueva sí', async () => {
  const user = await createAccount();
  const other = user.cookie; // otra sesión del mismo usuario (mismo token_version)
  const before = await storedUser(user.id);

  const res = await changePassword(user, { currentPassword: PASSWORD, newPassword: 'contraseña-nueva-2' });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { user: { id: number } }).user.id, user.id);
  const setCookie = sessionSetCookie(res);
  for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) {
    assert.ok(setCookie.includes(attribute), `${attribute} en ${setCookie}`);
  }

  const after = await storedUser(user.id);
  assert.equal(after.token_version, before.token_version + 1);
  assert.notEqual(after.password_hash, before.password_hash);
  assert.equal((await me(sessionCookie(res)))?.id, user.id);
  assert.equal(await me(other), null);

  // El login acepta la nueva y rechaza la anterior.
  const login = (password: string) => api(srv, 'POST', '/api/auth/login', { body: { email: user.email, password } });
  assert.equal((await login(PASSWORD)).status, 401);
  assert.equal((await login('contraseña-nueva-2')).status, 200);
});

test('RN-15: user.password_change se audita sin before ni after', async () => {
  const user = await createAccount();
  const res = await changePassword(user, { currentPassword: PASSWORD, newPassword: 'contraseña-nueva-3' });
  assert.equal(res.status, 200);
  const [entry, ...rest] = await auditOf(res);
  assert.equal(rest.length, 0);
  assert.equal(entry?.action, 'user.password_change');
  assert.equal(entry?.actorId, user.id);
  assert.equal(entry?.entityId, String(user.id));
  assert.equal(entry?.before, null);
  assert.equal(entry?.after, null);
});

test('Seguridad: la contraseña actual incorrecta da 400 en fields.currentPassword, sin cookie, cambio ni auditoría', async () => {
  const user = await createAccount();
  const before = await storedUser(user.id);
  const res = await changePassword(user, { currentPassword: 'no-es-la-buena', newPassword: 'contraseña-nueva-4' });
  const body = await assertError(res, 400, 'VALIDATION_ERROR', 'currentPassword');
  assert.equal(body.fields?.['currentPassword'], 'La contraseña actual no es correcta');
  assert.equal(sessionSetCookie(res), '');
  assert.deepEqual(await storedUser(user.id), before);
  assert.deepEqual(await auditOf(res), []);
  assert.equal((await me(user.cookie))?.id, user.id); // la sesión sigue valiendo
});

test('RN-12: la contraseña nueva va de 10 caracteres a 72 bytes; fuera de rango, 400 en fields.newPassword sin cambios', async () => {
  const user = await createAccount();
  const before = await storedUser(user.id);
  for (const newPassword of ['corta', '123456789', 'ñ'.repeat(37), undefined]) {
    await assertError(await changePassword(user, { currentPassword: PASSWORD, newPassword }), 400, 'VALIDATION_ERROR', 'newPassword');
  }
  await assertError(await changePassword(user, { newPassword: 'contraseña-nueva-5' }), 400, 'VALIDATION_ERROR', 'currentPassword');
  await assertError(await changePassword(user, { currentPassword: 'x'.repeat(73), newPassword: 'contraseña-nueva-5' }), 400, 'VALIDATION_ERROR', 'currentPassword');
  assert.deepEqual(await storedUser(user.id), before);
  // 10 caracteres y 36 «ñ» (72 bytes) valen.
  assert.equal((await changePassword(user, { currentPassword: PASSWORD, newPassword: 'ñ'.repeat(36) })).status, 200);
});

const windowSeconds = 15 * 60;
async function assertRateLimited(res: Response) {
  const body = await assertError(res, 429, 'RATE_LIMITED');
  const retryAfter = Number(res.headers.get('retry-after'));
  assert.ok(retryAfter > 0 && retryAfter <= windowSeconds, `Retry-After = ${retryAfter}`);
  const wait = (Date.parse((body as unknown as { retryAt: string }).retryAt) - Date.now()) / 1000;
  assert.ok(wait > 0 && wait <= windowSeconds);
}

const wrong = { currentPassword: 'no-es-la-buena', newPassword: 'contraseña-nueva-6' };

test('RN-13: 5 contraseñas actuales incorrectas en 15 min; el 6.º intento da 429 aunque acierte, y no cambia nada', async () => {
  const user = await createAccount();
  for (let i = 0; i < 5; i++) await assertError(await changePassword(user, wrong), 400, 'VALIDATION_ERROR', 'currentPassword');
  const before = await storedUser(user.id);
  await assertRateLimited(await changePassword(user, { currentPassword: PASSWORD, newPassword: 'contraseña-nueva-6' }));
  assert.deepEqual(await storedUser(user.id), before);
  // El contador es por usuario: otro usuario no está limitado.
  const other = await createAccount();
  await assertError(await changePassword(other, wrong), 400, 'VALIDATION_ERROR', 'currentPassword');
});

test('RN-13: acertar la contraseña actual pone el contador a cero', async () => {
  const user = await createAccount();
  for (let i = 0; i < 4; i++) await assertError(await changePassword(user, wrong), 400, 'VALIDATION_ERROR', 'currentPassword');
  const ok = await changePassword(user, { currentPassword: PASSWORD, newPassword: 'contraseña-nueva-7' });
  assert.equal(ok.status, 200);
  const renewed = { ...user, cookie: sessionCookie(ok) };
  for (let i = 0; i < 5; i++) await assertError(await changePassword(renewed, wrong), 400, 'VALIDATION_ERROR', 'currentPassword');
  await assertRateLimited(await changePassword(renewed, wrong));
});

test('RN-13: un 400 de validación no cuenta para el límite del cambio de contraseña', async () => {
  const user = await createAccount();
  for (let i = 0; i < 6; i++) {
    await assertError(await changePassword(user, { currentPassword: PASSWORD, newPassword: 'corta' }), 400, 'VALIDATION_ERROR', 'newPassword');
  }
  assert.equal((await changePassword(user, { currentPassword: PASSWORD, newPassword: 'contraseña-nueva-8' })).status, 200);
});

// ── Sesión, CSRF y cuerpo ─────────────────────────────────────────────────────

test('Seguridad: sin sesión, PATCH /api/me y POST /api/auth/password dan 401 UNAUTHENTICATED', async () => {
  await assertError(await patchMe(null, { displayName: 'Invitado' }), 401, 'UNAUTHENTICATED');
  await assertError(await changePassword(null, { currentPassword: PASSWORD, newPassword: 'contraseña-nueva-9' }), 401, 'UNAUTHENTICATED');
});

test('Seguridad: una cuenta suspendida no cambia ni el nombre ni la contraseña (su sesión ya no vale)', async () => {
  const user = await createAccount();
  await (await db()).query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [user.id]);
  await assertError(await patchMe(user, { displayName: 'Suspendida' }), 401, 'UNAUTHENTICATED');
  await assertError(await changePassword(user, { currentPassword: PASSWORD, newPassword: 'contraseña-nueva-9' }), 401, 'UNAUTHENTICATED');
});

test('Seguridad: PATCH /api/me y POST /api/auth/password exigen el Origin propio (CSRF)', async () => {
  const user = await createAccount();
  const headers = { 'Content-Type': 'application/json', Cookie: user.cookie };
  const patch = await fetch(`${srv.baseUrl}/api/me`, { method: 'PATCH', headers, body: JSON.stringify({ displayName: 'Sin Origin' }) });
  await assertError(patch, 403, 'CSRF');
  const post = await fetch(`${srv.baseUrl}/api/auth/password`, {
    method: 'POST',
    headers: { ...headers, Origin: 'https://evil.example' },
    body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'contraseña-nueva-9' }),
  });
  await assertError(post, 403, 'CSRF');
  assert.equal((await storedUser(user.id)).display_name, `Perfil ${RUN}`);
});

test('Seguridad: el cuerpo de POST /api/auth/password admite como mucho 4 kB', async () => {
  const user = await createAccount();
  const res = await changePassword(user, { currentPassword: PASSWORD, newPassword: 'contraseña-nueva-9', relleno: 'x'.repeat(5 * 1024) });
  await assertError(res, 413, 'PAYLOAD_TOO_LARGE');
});
