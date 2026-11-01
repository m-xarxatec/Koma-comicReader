import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

let server: Server;
let baseUrl: string;

before(async () => {
  const { app } = await import('../../app.js');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  const { pool } = await import('../../db/pool.js');
  await pool.end();
});

test('Seguridad: GET /api/health responde 200 con la BD accesible y X-Request-Id', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^application\/json/);
  assert.match(res.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
  assert.deepEqual(await res.json(), { status: 'ok', db: 'ok' });
});

test('Seguridad: cada petición lleva un X-Request-Id distinto', async () => {
  const [a, b] = await Promise.all([fetch(`${baseUrl}/api/health`), fetch(`${baseUrl}/api/health`)]);
  assert.notEqual(a.headers.get('x-request-id'), b.headers.get('x-request-id'));
});
