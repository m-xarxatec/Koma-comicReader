import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { pool } from '../../db/pool.js';
import { signSession } from '../../modules/auth/auth.service.js';
import * as auditRepository from '../../modules/audit/audit.repository.js';
import * as usersRepository from '../../modules/users/users.repository.js';
import { api, SESSION_COOKIE, sessionCookie, sessionSetCookie, startTestServer } from './helpers.js';

// Contrato de la API del bloque 1 (docs/plan_mvp.md) contra koma_test, reiniciada y sembrada por
// reset-test-db. Se registran como mucho 2 cuentas: el límite de registro (RN-13) es 3/h por IP.

const srv = startTestServer();

const READER = { email: 'reader@demo.test', password: process.env['SEED_READER_PASSWORD'] ?? '' };
const AUTHOR = { email: 'author@demo.test', password: process.env['SEED_AUTHOR_PASSWORD'] ?? '' };
const ADMIN = { email: 'admin@demo.test', password: process.env['SEED_ADMIN_PASSWORD'] ?? '' };

const login = (credentials: { email: string; password: string }) => api(srv, 'POST', '/api/auth/login', { body: credentials });
const me = (cookie?: string) => api(srv, 'GET', '/api/me', { cookie });
const auditOf = (res: Response) => auditRepository.findByRequestId(pool, res.headers.get('x-request-id') ?? '');
const isCleared = (setCookie: string) => setCookie.startsWith(`${SESSION_COOKIE}=;`) && /Expires=Thu, 01 Jan 1970/.test(setCookie);

test('RN-12: el registro crea la cuenta, responde 201 con el usuario y abre sesión', async () => {
  const email = `Nueva-${randomUUID()}@Demo.Test`;
  const res = await api(srv, 'POST', '/api/auth/register', {
    body: { email: `  ${email} `, password: 'una-contraseña-larga', displayName: '  Nueva Lectora ' },
  });
  assert.equal(res.status, 201);
  const { user } = (await res.json()) as { user: Record<string, unknown> };
  assert.deepEqual(Object.keys(user).sort(), ['displayName', 'email', 'id', 'isAuthor', 'isPremium', 'premiumUntil', 'role']);
  assert.equal(user['email'], email.toLowerCase());
  assert.equal(user['displayName'], 'Nueva Lectora');
  assert.equal(user['role'], 'user');
  assert.equal(user['isPremium'], false);

  const setCookie = sessionSetCookie(res);
  for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) {
    assert.ok(setCookie.includes(attribute), `${attribute} en ${setCookie}`);
  }
  const current = (await (await me(sessionCookie(res))).json()) as { user: { id: number } };
  assert.equal(current.user.id, user['id']);

  const [entry] = await auditOf(res);
  assert.equal(entry?.action, 'user.register');
  assert.equal(entry?.actorId, user['id']);
  assert.deepEqual(entry?.after, { email: email.toLowerCase(), displayName: 'Nueva Lectora' });
  assert.equal(entry?.ip, '127.0.0.1');
});

test('RN-12: el correo es único sin distinguir mayúsculas: 409 EMAIL_TAKEN', async () => {
  const res = await api(srv, 'POST', '/api/auth/register', {
    body: { email: 'READER@demo.test', password: 'una-contraseña-larga', displayName: 'Otra Cuenta' },
  });
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code: string }).code, 'EMAIL_TAKEN');
});

test('RN-12: datos no válidos dan 400 VALIDATION_ERROR con un mensaje por campo', async () => {
  const res = await api(srv, 'POST', '/api/auth/register', {
    body: { email: 'no-es-un-correo', password: 'corta', displayName: 'Al' },
  });
  const body = (await res.json()) as { code: string; fields: Record<string, string> };
  assert.equal(res.status, 400);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.deepEqual(Object.keys(body.fields).sort(), ['displayName', 'email', 'password']);
  assert.equal(sessionSetCookie(res), '', 'sin sesión');
});

test('Seguridad: un login correcto responde 200 con el usuario, abre sesión y audita auth.login_ok', async () => {
  const res = await login({ email: '  Reader@Demo.TEST ', password: READER.password });
  assert.equal(res.status, 200);
  const { user } = (await res.json()) as { user: { email: string } };
  assert.equal(user.email, READER.email);
  assert.notEqual(sessionCookie(res), '');
  const [entry] = await auditOf(res);
  assert.equal(entry?.action, 'auth.login_ok');
  assert.equal(entry?.after, null);
});

test('Seguridad: contraseña incorrecta y correo inexistente dan el mismo 401 y se auditan sin la contraseña', async () => {
  const wrongPassword = await login({ email: READER.email, password: 'no-es-la-contraseña' });
  const unknownEmail = await login({ email: `nadie-${randomUUID()}@demo.test`, password: 'no-es-la-contraseña' });
  const [a, b] = (await Promise.all([wrongPassword.json(), unknownEmail.json()])) as { code: string; message: string }[];
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.equal(a?.code, 'INVALID_CREDENTIALS');
  assert.deepEqual([a?.code, a?.message], [b?.code, b?.message]);

  const [known] = await auditOf(wrongPassword);
  const [unknown] = await auditOf(unknownEmail);
  assert.equal(known?.action, 'auth.login_fail');
  assert.equal(known?.actorId, null);
  assert.match(known?.entityId ?? '', /^\d+$/, 'entity_id = id del usuario, nunca el correo');
  assert.deepEqual(known?.after, { email: READER.email, reason: 'credentials' });
  assert.equal(unknown?.entityId, null);
  assert.doesNotMatch(JSON.stringify([known, unknown]), /no-es-la-contraseña/);
});

test('Seguridad: una cuenta suspendida da 403 ACCOUNT_SUSPENDED solo con la contraseña correcta', async () => {
  const author = await usersRepository.findByEmail(pool, AUTHOR.email);
  assert.ok(author);
  await usersRepository.updateStatus(pool, author.id, 'suspended');

  const right = await login(AUTHOR);
  assert.equal(right.status, 403);
  assert.equal(((await right.json()) as { code: string }).code, 'ACCOUNT_SUSPENDED');
  assert.deepEqual((await auditOf(right))[0]?.after, { email: AUTHOR.email, reason: 'suspended' });

  const wrong = await login({ email: AUTHOR.email, password: 'no-es-la-contraseña' });
  assert.equal(wrong.status, 401, 'sin la contraseña no se revela la suspensión');
});

test('RN-15: cambiar el estado de la cuenta invalida la sesión abierta y borra su cookie', async () => {
  const cookie = sessionCookie(await login(ADMIN));
  assert.equal(((await (await me(cookie)).json()) as { user: unknown }).user !== null, true);

  const admin = await usersRepository.findByEmail(pool, ADMIN.email);
  assert.ok(admin);
  await usersRepository.updateStatus(pool, admin.id, 'active'); // incrementa token_version

  const res = await me(cookie);
  assert.deepEqual(await res.json(), { user: null });
  assert.ok(isCleared(sessionSetCookie(res)), sessionSetCookie(res));
});

test('Seguridad: con su token_version actual, un usuario suspendido sigue siendo invitado', async () => {
  const author = await usersRepository.findByEmail(pool, AUTHOR.email); // suspendido en un test anterior
  assert.equal(author?.status, 'suspended');
  const res = await me(`${SESSION_COOKIE}=${signSession(author!)}`);
  assert.deepEqual(await res.json(), { user: null });
});

test('Seguridad: un token manipulado o de otra clave se trata como invitado y se borra', async () => {
  for (const token of ['basura', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIiwidHYiOjB9.']) {
    const res = await me(`${SESSION_COOKIE}=${token}`);
    assert.deepEqual(await res.json(), { user: null }, token);
    assert.ok(isCleared(sessionSetCookie(res)), token);
  }
});

test('Seguridad: GET /api/me sin sesión responde { user: null }', async () => {
  const res = await me();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { user: null });
});

test('Seguridad: logout responde 204, borra la cookie y audita auth.logout; sin sesión, 204 sin auditoría', async () => {
  const cookie = sessionCookie(await login(READER));
  const res = await api(srv, 'POST', '/api/auth/logout', { cookie });
  assert.equal(res.status, 204);
  assert.ok(isCleared(sessionSetCookie(res)));
  assert.equal((await auditOf(res))[0]?.action, 'auth.logout');

  const guest = await api(srv, 'POST', '/api/auth/logout');
  assert.equal(guest.status, 204);
  assert.deepEqual(await auditOf(guest), []);
});

test('Seguridad: las rutas de sesión exigen el Origin propio (CSRF)', async () => {
  const res = await fetch(`${srv.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: 'http://evil.test', 'Content-Type': 'application/json' },
    body: JSON.stringify(READER),
  });
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { code: string }).code, 'CSRF');
});
