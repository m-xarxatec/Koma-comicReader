import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';

// Peticiones del cliente (client/dist, lo genera `tsc -b`). api.ts solo usa fetch, así que aquí se sustituye
// fetch por uno que guarda la petición y responde 201, sin navegador ni servidor.

interface ClientAuth {
  register: (input: { email: string; password: string; displayName: string }) => Promise<unknown>;
}

const load = <T>(file: string) => import(pathToFileURL(path.join(paths.clientDistDir, file)).href) as Promise<T>;
const auth = await load<ClientAuth>('services/auth.js');

test('Seguridad: el registro envía a la API solo email, password y displayName (passwordConfirm se queda en el cliente)', async (t) => {
  const sent: { url: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(JSON.stringify({ user: {} }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  });

  // Como llegan los valores del formulario de /registro, con el campo que solo existe en el cliente.
  const values = { email: 'ana@demo.test', password: 'contraseña-larga-1', displayName: 'Ana', passwordConfirm: 'contraseña-larga-1' };
  await auth.register(values);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.url, '/api/auth/register');
  assert.equal(sent[0]?.init.method, 'POST');
  const body = JSON.parse(String(sent[0]?.init.body)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ['displayName', 'email', 'password']);
  assert.deepEqual(body, { email: values.email, password: values.password, displayName: values.displayName });
});
