import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

// La lista de la demo en la LAN (docker-compose.yml). Se fija antes de importar `app`, porque
// config/env.ts lee las variables al cargarse; cada archivo de test corre en su propio proceso.
process.env.ALLOWED_ORIGINS = 'http://koma.local,http://localhost';

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

const post = (origin: string) => fetch(`${baseUrl}/api/health`, { method: 'POST', headers: { Origin: origin } });

// Aún no hay rutas POST: superar el control CSRF lleva al 404 de la API.
test('Seguridad: un POST con Origin http://koma.local de ALLOWED_ORIGINS pasa el control CSRF', async () => {
  const res = await post('http://koma.local');
  const body = (await res.json()) as { code: string };
  assert.equal(res.status, 404);
  assert.equal(body.code, 'NOT_FOUND');
});

test('Seguridad: un POST con Origin http://evil.test devuelve 403 CSRF', async () => {
  const res = await post('http://evil.test');
  const body = (await res.json()) as { code: string; requestId: string };
  assert.equal(res.status, 403);
  assert.equal(body.code, 'CSRF');
  assert.equal(body.requestId, res.headers.get('x-request-id'));
});
