import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';

// BD inaccesible: puerto 1, que rechaza la conexión al instante. Se fija antes de que before() importe
// `app`, porque config/env.ts lee las variables al cargarse; cada archivo de test corre en su propio proceso.
process.env.DATABASE_URL = 'postgres://koma:koma@127.0.0.1:1/koma_test';
process.env.LOG_LEVEL = 'warn'; // el 503 se registra como error; aquí es lo esperado

const srv = startTestServer();

test('Seguridad: sin BD, GET /api/health responde 503 SERVICE_UNAVAILABLE en JSON', async () => {
  const res = await fetch(`${srv.baseUrl}/api/health`);
  const body = (await res.json()) as { code: string; requestId: string };
  assert.equal(res.status, 503);
  assert.equal(body.code, 'SERVICE_UNAVAILABLE');
  assert.equal(body.requestId, res.headers.get('x-request-id'));
});
