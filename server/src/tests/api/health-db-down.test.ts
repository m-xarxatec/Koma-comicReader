import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

// BD inaccesible: puerto 1, que rechaza la conexión al instante. Se fija antes de importar `app`, porque
// config/env.ts lee las variables al cargarse; cada archivo de test corre en su propio proceso.
process.env.DATABASE_URL = 'postgres://koma:koma@127.0.0.1:1/koma_test';
process.env.LOG_LEVEL = 'warn'; // el 503 se registra como error; aquí es lo esperado

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
});

test('Seguridad: sin BD, GET /api/health responde 503 SERVICE_UNAVAILABLE en JSON', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  const body = (await res.json()) as { code: string; requestId: string };
  assert.equal(res.status, 503);
  assert.equal(body.code, 'SERVICE_UNAVAILABLE');
  assert.equal(body.requestId, res.headers.get('x-request-id'));
});
