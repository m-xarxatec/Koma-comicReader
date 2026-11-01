import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';

const srv = startTestServer();

test('Seguridad: GET /api/health responde 200 con la BD accesible y X-Request-Id', async () => {
  const res = await fetch(`${srv.baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^application\/json/);
  assert.match(res.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
  assert.deepEqual(await res.json(), { status: 'ok', db: 'ok' });
});

test('Seguridad: cada petición lleva un X-Request-Id distinto', async () => {
  const [a, b] = await Promise.all([fetch(`${srv.baseUrl}/api/health`), fetch(`${srv.baseUrl}/api/health`)]);
  assert.notEqual(a.headers.get('x-request-id'), b.headers.get('x-request-id'));
});
