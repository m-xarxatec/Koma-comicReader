import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createUser } from './reading-fixtures.js';

// Parámetros de lectura (CU-36; RN-16; contrato del bloque 4) contra koma_test. Aquí no se cambia ningún valor de
// verdad: otros archivos de test (saldo, lectura) corren a la vez con los del seed. El cálculo de lo que cambia y su
// auditoría están en tests/unit/admin.test.ts (settingsChange); el cambio real se comprueba a mano (bitácora).
const srv = startTestServer();
const SEED = { waitMinutes: 1, maxBalance: 5, refill: 2 };

const codeOf = async (res: Response) => `${res.status} ${((await res.json()) as { code: string }).code}`;

test('Seguridad: los parámetros exigen sesión y rol admin', async () => {
  assert.equal(await codeOf(await api(srv, 'GET', '/api/admin/settings')), '401 UNAUTHENTICATED');
  const reader = await createUser('reader');
  assert.equal(await codeOf(await api(srv, 'PUT', '/api/admin/settings', { cookie: reader.cookie, body: SEED })), '403 FORBIDDEN');
});

test('RN-16: GET devuelve los parámetros vigentes; PUT con los mismos valores responde 200 sin escribir en la auditoría', async () => {
  const admin = await createUser('admin');
  const res = await api(srv, 'GET', '/api/admin/settings', { cookie: admin.cookie });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { settings: SEED });
  const put = await api(srv, 'PUT', '/api/admin/settings', { cookie: admin.cookie, body: SEED });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { settings: SEED });
  const { pool } = await import('../../db/pool.js');
  const { rows } = await pool.query('SELECT 1 FROM audit_log WHERE request_id = $1', [put.headers.get('x-request-id')]);
  assert.equal(rows.length, 0);
});

test('RN-16: fuera de rango, no enteros, ausentes o con claves de más dan 400 con fields, y no se guarda nada', async () => {
  const admin = await createUser('admin');
  const cases: [Record<string, unknown>, string][] = [
    [{ ...SEED, waitMinutes: 0 }, 'waitMinutes'],
    [{ ...SEED, waitMinutes: 1441 }, 'waitMinutes'],
    [{ ...SEED, maxBalance: 21 }, 'maxBalance'],
    [{ ...SEED, maxBalance: 0 }, 'maxBalance'],
    [{ ...SEED, refill: 11 }, 'refill'],
    [{ ...SEED, refill: 1.5 }, 'refill'],
    [{ ...SEED, refill: '2' }, 'refill'],
    [{ waitMinutes: 1, maxBalance: 5 }, 'refill'],
  ];
  for (const [body, field] of cases) {
    const res = await api(srv, 'PUT', '/api/admin/settings', { cookie: admin.cookie, body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok(((await res.json()) as { fields: Record<string, string> }).fields[field], `${field} en ${JSON.stringify(body)}`);
  }
  assert.equal(await codeOf(await api(srv, 'PUT', '/api/admin/settings', { cookie: admin.cookie, body: { ...SEED, freeChapters: 3 } })), '400 VALIDATION_ERROR');
  assert.deepEqual(await (await api(srv, 'GET', '/api/admin/settings', { cookie: admin.cookie })).json(), { settings: SEED });
});
