import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createUser, type TestUser } from './reading-fixtures.js';

// Cierre del bloque 6 (/code-review, 18-nov): multer acota cada texto de una ilustración a 4 KB (`fieldSize`). Al
// pasarse, su error salía con el mensaje de las viñetas («Envía una sola imagen en el campo image, sin otros
// campos») bajo la imagen, aunque la ilustración sí lleva textos. Ahora nombra el campo que se pasa. Temporal de
// multer y almacenamiento local propios de este archivo.
const storageDir = mkdtempSync(path.join(tmpdir(), 'koma-illustrations-field-storage-'));
const uploadTmp = mkdtempSync(path.join(tmpdir(), 'koma-illustrations-field-tmp-'));
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

function publish(user: TestUser, fields: Record<string, string>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append('image', new Blob([png()]), 'dibujo.png');
  return fetch(`${srv.baseUrl}/api/illustrations`, { method: 'POST', headers: { Origin: srv.origin, Cookie: user.cookie }, body: form });
}

const ownTotal = async (user: TestUser) =>
  ((await (await api(srv, 'GET', '/api/me/illustrations', { cookie: user.cookie })).json()) as { total: number }).total;

test('RN-22: un texto de una ilustración de más de 4 KB da 400 en su campo (no en fields.image), sin crear nada ni dejar temporales', async () => {
  const reader = await createUser('reader');
  const res = await publish(reader, { title: 'Una ilustración', tags: 'acuarela, '.repeat(500) });
  assert.equal(res.status, 400, await res.clone().text());
  const body = (await res.json()) as { code: string; fields?: Record<string, string> };
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.equal(body.fields?.['tags'], 'Este texto es demasiado largo');
  assert.equal(body.fields?.['image'], undefined, 'la imagen no tiene la culpa');
  assert.equal(await ownTotal(reader), 0, 'ninguna ilustración creada');
  assert.deepEqual(readdirSync(uploadTmp), [], 'sin temporales de multer');
});

test('Seguridad: un campo de texto que no es de la ilustración sigue dando el mensaje general en fields.image, sin repetir su nombre', async () => {
  const reader = await createUser('reader');
  const res = await publish(reader, { title: 'Una ilustración', '<b>campo</b>': 'x'.repeat(5000) });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { fields?: Record<string, string> };
  assert.equal(body.fields?.['image'], 'Envía una sola imagen en el campo image, sin otros campos');
  assert.equal(Object.keys(body.fields ?? {}).length, 1, 'ningún campo con el nombre que manda el cliente');
});
