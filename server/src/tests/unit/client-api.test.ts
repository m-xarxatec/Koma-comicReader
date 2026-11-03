import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';

// services/api.ts del cliente (client/dist, lo genera `tsc -b`), con fetch sustituido por uno que guarda la
// petición: sin navegador ni servidor.

interface ClientApi {
  api: {
    get: (path: string, options?: { headers?: Record<string, string> }) => Promise<unknown>;
    post: (path: string, body?: unknown, options?: { headers?: Record<string, string> }) => Promise<unknown>;
  };
}

const { api } = (await import(pathToFileURL(path.join(paths.clientDistDir, 'services/api.js')).href)) as ClientApi;

type Sent = { url: string; headers: Record<string, string> };

function captureFetch(t: { mock: { method: (object: object, name: string, fn: (...args: never[]) => unknown) => unknown } }): Sent[] {
  const sent: Sent[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    sent.push({ url, headers: { ...(init.headers as Record<string, string>) } });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return sent;
}

test('RN-01: api.ts envía X-Ad-Token solo en la petición que lo pasa', async (t) => {
  const sent = captureFetch(t);
  await api.post('/api/comics/obra/chapters/3/read', undefined, { headers: { 'X-Ad-Token': 'token.firma' } });
  await api.post('/api/comics/obra/chapters/4/read');
  await api.get('/api/comics/obra');
  assert.deepEqual(sent[0]?.headers, { 'X-Ad-Token': 'token.firma', Accept: 'application/json' });
  assert.deepEqual(sent[1]?.headers, { Accept: 'application/json' });
  assert.deepEqual(sent[2]?.headers, { Accept: 'application/json' });
});

test('Seguridad: las cabeceras opcionales no sustituyen Accept ni el Content-Type del cuerpo JSON', async (t) => {
  const sent = captureFetch(t);
  await api.post('/api/x', { a: 1 }, { headers: { Accept: 'text/html', 'Content-Type': 'text/plain', 'X-Extra': '1' } });
  assert.deepEqual(sent[0]?.headers, { 'X-Extra': '1', Accept: 'application/json', 'Content-Type': 'application/json' });
});
