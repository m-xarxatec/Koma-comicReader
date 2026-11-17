import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { UPLOAD_LIMIT } from '../../middlewares/rate-limit.js';
import { api, startTestServer } from './helpers.js';
import { createUser, type TestUser } from './reading-fixtures.js';

// Publicar ilustraciones pasa por el limitador de subidas (RN-13: 100 / h por usuario, «ilustraciones incluidas,
// RN-22»; contrato del bloque 6, 429 entre los errores de POST /api/illustrations). El limitador va antes de multer y
// de zod (contrato del bloque 6): un intento con el título vacío llega a multer, da 400 y cuenta. Temporal de multer y
// almacenamiento local propios de este archivo.
const storageDir = mkdtempSync(path.join(tmpdir(), 'koma-illustrations-limit-storage-'));
const uploadTmp = mkdtempSync(path.join(tmpdir(), 'koma-illustrations-limit-tmp-'));
process.env['STORAGE_DRIVER'] = 'local';
process.env['STORAGE_LOCAL_DIR'] = storageDir;
process.env['TMPDIR'] = uploadTmp;

const srv = startTestServer();
after(async () => {
  await rm(storageDir, { recursive: true, force: true });
  await rm(uploadTmp, { recursive: true, force: true });
});

const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(800), ...be32(1200), 8, 6, 0, 0, 0, ...be32(0)]);

function publish(user: TestUser, title: string) {
  const form = new FormData();
  form.append('title', title);
  form.append('image', new Blob([png()]), 'dibujo.png');
  return fetch(`${srv.baseUrl}/api/illustrations`, { method: 'POST', headers: { Origin: srv.origin, Cookie: user.cookie }, body: form });
}

const ownTotal = async (user: TestUser) =>
  ((await (await api(srv, 'GET', '/api/me/illustrations', { cookie: user.cookie })).json()) as { total: number }).total;

test('RN-13: la publicación 101 de ilustraciones en una hora da 429 con retryAt (cuenta cada intento, también un 400), sin crear nada; otro usuario no está limitado', async () => {
  const reader = await createUser('reader');
  for (let i = 1; i <= UPLOAD_LIMIT; i++) assert.equal((await publish(reader, '')).status, 400, `intento ${i}`);

  const res = await publish(reader, 'Una ilustración válida');
  assert.equal(res.status, 429, await res.clone().text());
  const body = (await res.json()) as { code: string; retryAt: string };
  assert.equal(body.code, 'RATE_LIMITED');
  assert.ok(Number(res.headers.get('retry-after')) > 0, 'Retry-After');
  assert.ok(Date.parse(body.retryAt) > Date.now(), 'retryAt en el futuro');
  assert.equal(await ownTotal(reader), 0, 'ninguna ilustración creada');
  assert.deepEqual(readdirSync(uploadTmp), [], 'sin temporales de multer');

  const other = await createUser('reader');
  assert.equal((await publish(other, 'Una ilustración válida')).status, 201);
});
