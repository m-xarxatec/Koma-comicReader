import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { api, startTestServer } from './helpers.js';

// RN-13. Cada archivo de test corre en su propio proceso: los contadores en memoria empiezan a cero.
// Todas las peticiones salen de 127.0.0.1, así que comparten la IP de la clave.

const srv = startTestServer();

const PREMIUM = { email: 'premium@demo.test', password: process.env['SEED_PREMIUM_PASSWORD'] ?? '' };
const WRONG = 'no-es-la-contraseña';

const login = (email: string, password: string) => api(srv, 'POST', '/api/auth/login', { body: { email, password } });
const register = (email: string) =>
  api(srv, 'POST', '/api/auth/register', { body: { email, password: 'una-contraseña-larga', displayName: 'Cuenta Límite' } });

async function assertRateLimited(res: Response, windowSeconds: number) {
  const body = (await res.json()) as { code: string; retryAt: string };
  assert.equal(res.status, 429);
  assert.equal(body.code, 'RATE_LIMITED');
  const retryAfter = Number(res.headers.get('retry-after'));
  assert.ok(retryAfter > 0 && retryAfter <= windowSeconds, `Retry-After = ${retryAfter}`);
  const wait = (Date.parse(body.retryAt) - Date.now()) / 1000;
  assert.ok(wait > 0 && wait <= windowSeconds, `retryAt = ${body.retryAt}`);
}

test('RN-13: el login admite 5 fallos por IP y correo en 15 min; el 6.º da 429 con Retry-After y retryAt', async () => {
  const email = `ataque-${randomUUID()}@demo.test`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    // El correo se normaliza también en la clave: mayúsculas y espacios cuentan como el mismo.
    const res = await login(attempt % 2 ? email : `  ${email.toUpperCase()} `, WRONG);
    assert.equal(res.status, 401, `intento ${attempt}`);
  }
  await assertRateLimited(await login(email, WRONG), 15 * 60);

  // La clave es IP + correo: otro correo desde la misma IP sigue pudiendo intentarlo.
  assert.equal((await login(`otra-${randomUUID()}@demo.test`, WRONG)).status, 401);
});

test('RN-13: un login correcto pone a cero los fallos de su IP y correo', async () => {
  for (let attempt = 1; attempt <= 4; attempt++) assert.equal((await login(PREMIUM.email, WRONG)).status, 401);
  assert.equal((await login(PREMIUM.email, PREMIUM.password)).status, 200);
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal((await login(PREMIUM.email, WRONG)).status, 401, `fallo ${attempt} tras el reinicio`);
  }
  await assertRateLimited(await login(PREMIUM.email, WRONG), 15 * 60);
});

test('RN-13: el registro admite 3 por hora e IP; los 400 de validación no cuentan y los 409 sí', async () => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const invalid = await api(srv, 'POST', '/api/auth/register', { body: { email: 'mal', password: 'x', displayName: '' } });
    assert.equal(invalid.status, 400, `400 número ${attempt}`);
  }
  const email = `limite-${randomUUID()}@demo.test`;
  assert.equal((await register(email)).status, 201);
  assert.equal((await register(email)).status, 409);
  assert.equal((await register(`limite-${randomUUID()}@demo.test`)).status, 201);
  await assertRateLimited(await register(`limite-${randomUUID()}@demo.test`), 60 * 60);
});
