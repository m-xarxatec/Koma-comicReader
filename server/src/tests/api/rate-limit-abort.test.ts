import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { ipKeyGenerator } from 'express-rate-limit';
import { pool } from '../../db/pool.js';
import { REGISTER_LIMIT, registerRateLimit } from '../../middlewares/rate-limit.js';
import * as usersRepository from '../../modules/users/users.repository.js';
import { api, startTestServer } from './helpers.js';

// RN-13. Archivo propio porque gasta entero el límite de registro (3/h por IP): cada archivo de test corre
// en su propio proceso, con los contadores en memoria a cero. Todas las peticiones salen de 127.0.0.1.

const srv = startTestServer();

const REGISTER_KEY = ipKeyGenerator('127.0.0.1'); // el registro se cuenta solo por IP
const registerHits = async () => (await registerRateLimit.getKey(REGISTER_KEY))?.totalHits ?? 0;
const newAccount = () => ({ email: `cortado-${randomUUID()}@demo.test`, password: 'una-contraseña-larga', displayName: 'Cuenta Cortada' });

async function waitFor(check: () => Promise<boolean>, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) assert.fail(`Tiempo agotado esperando: ${what}`);
    await sleep(5);
  }
}

test('RN-13: los registros que el cliente corta antes de la respuesta siguen contando; tras 3, el siguiente da 429', async () => {
  const cut: string[] = [];
  for (let attempt = 1; attempt <= REGISTER_LIMIT; attempt++) {
    const account = newAccount();
    cut.push(account.email);
    const controller = new AbortController();
    const pending = fetch(`${srv.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { Origin: srv.origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
      signal: controller.signal,
    });
    // Se corta en cuanto el limitador la ha contado, mientras el servidor calcula el hash (bcrypt tarda
    // cientos de ms): la conexión se cierra antes de que haya respuesta.
    await waitFor(async () => (await registerHits()) === attempt, `intento ${attempt} contado`);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' }, `intento ${attempt} cortado`);
  }

  // El servidor termina el alta aunque el cliente se haya ido: por eso el intento no se puede devolver.
  for (const email of cut) {
    await waitFor(async () => (await usersRepository.findByEmail(pool, email)) !== null, `cuenta ${email} creada`);
  }
  assert.equal(await registerHits(), REGISTER_LIMIT, 'ningún intento cortado se ha descontado');

  const blocked = newAccount();
  const res = await api(srv, 'POST', '/api/auth/register', { body: blocked });
  assert.equal(res.status, 429);
  assert.equal(((await res.json()) as { code: string }).code, 'RATE_LIMITED');
  assert.equal(await usersRepository.findByEmail(pool, blocked.email), null, 'el 429 no crea la cuenta');
});
