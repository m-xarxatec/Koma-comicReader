import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

const KB = 1024;

let server: Server;
let baseUrl: string;
let origin: string; // un origen de ALLOWED_ORIGINS, para pasar el control CSRF

before(async () => {
  const { app } = await import('../../app.js');
  const { env } = await import('../../config/env.js');
  origin = env.ALLOWED_ORIGINS[0]!;
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

// Aún no hay rutas POST: un cuerpo aceptado lleva al 404 de la API.
const post = (body: string, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}/api/health`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body,
  });
const json = (bytes: number) => JSON.stringify({ text: 'a'.repeat(bytes) });

async function assertError(res: Response, status: number, code: string, message: string) {
  const body = (await res.json()) as { code: string; message: string; requestId: string };
  assert.equal(res.status, status);
  assert.equal(body.code, code);
  assert.equal(body.message, message);
  assert.equal(body.requestId, res.headers.get('x-request-id'));
}

test('Seguridad: un cuerpo JSON de más de 100 kB devuelve 413 PAYLOAD_TOO_LARGE', async () => {
  await assertError(await post(json(101 * KB)), 413, 'PAYLOAD_TOO_LARGE', 'La petición es demasiado grande');
});

test('Seguridad: un cuerpo JSON de menos de 100 kB pasa el límite', async () => {
  const res = await post(json(99 * KB));
  assert.equal(res.status, 404);
});

// Los otros 400 de body-parser (request.aborted, request.size.invalid) no se pueden provocar desde
// un cliente HTTP: en el primero nadie recibe la respuesta y el segundo lo impide el parser de Node.
test('Seguridad: un JSON mal formado devuelve 400 VALIDATION_ERROR', async () => {
  await assertError(await post('{"text":'), 400, 'VALIDATION_ERROR', 'El cuerpo de la petición no es un JSON válido');
});

test('Seguridad: un charset no admitido devuelve 415 UNSUPPORTED_MEDIA_TYPE', async () => {
  const res = await post('{"text":"a"}', { 'Content-Type': 'application/json; charset=latin1' });
  await assertError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'El formato de la petición no es compatible');
});

test('Seguridad: un Content-Encoding no admitido devuelve 415 UNSUPPORTED_MEDIA_TYPE', async () => {
  const res = await post('{"text":"a"}', { 'Content-Encoding': 'br2' });
  await assertError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'El formato de la petición no es compatible');
});
