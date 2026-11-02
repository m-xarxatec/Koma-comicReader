import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createLocalStorage } from '../../integrations/storage/local.js';
import { createR2Storage, r2ImageHosts } from '../../integrations/storage/r2.js';
import { IMAGE_KEY_PATTERN, newImageKey } from '../../utils/image.js';
import { deriveKey, verifyExpiring } from '../../utils/signing.js';

// Drivers con su configuración inyectada: el local escribe en un directorio temporal y el de R2 firma sin
// red (una URL prefirmada se calcula en local con las credenciales; aquí son ficticias).

const TTL = 7200;
const signingKey = deriveKey('s'.repeat(48), 'files');
let dir = '';
let source = '';

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'koma-storage-'));
  source = path.join(dir, 'origen.bin');
  await writeFile(source, 'contenido de prueba');
});
after(() => rm(dir, { recursive: true, force: true }));

test('RN-10: las claves de imagen son UUID.ext generadas por el servidor, con la extensión del tipo detectado', () => {
  for (const type of ['jpg', 'png', 'webp'] as const) {
    const key = newImageKey(type);
    assert.match(key, IMAGE_KEY_PATTERN);
    assert.ok(key.endsWith(`.${type}`));
  }
  assert.notEqual(newImageKey('webp'), newImageKey('webp'));
});

test('Seguridad: el driver local copia el archivo con su clave y firma URLs /files que caducan a los SIGNED_URL_TTL_SECONDS', async () => {
  const storageDir = path.join(dir, 'local');
  const storage = createLocalStorage({ dir: storageDir, ttlSeconds: TTL, signingKey });
  const key = newImageKey('webp');
  await storage.put(key, source, 'image/webp');
  assert.equal(await readFile(path.join(storageDir, key), 'utf8'), 'contenido de prueba');

  const now = Math.floor(Date.now() / 1000);
  const match = /^\/files\/([^?]+)\?exp=(\d+)&sig=([A-Za-z0-9_-]{43})$/.exec(await storage.signedUrl(key));
  assert.ok(match, 'formato de la URL');
  const [, urlKey, exp, sig] = match;
  assert.equal(urlKey, key);
  assert.ok(Math.abs(Number(exp) - (now + TTL)) <= 1, 'caduca a los TTL segundos');
  assert.equal(verifyExpiring(signingKey, key, Number(exp), sig!, now), 'valid');

  // Nunca sobrescribe una clave existente.
  await assert.rejects(storage.put(key, source, 'image/webp'), { code: 'EEXIST' });
});

test('Seguridad: los drivers rechazan claves que no son UUID.ext antes de tocar el disco o la red', async () => {
  const storageDir = path.join(dir, 'rechazos');
  const local = createLocalStorage({ dir: storageDir, ttlSeconds: TTL, signingKey });
  const r2 = createR2Storage({ accountId: 'cuenta', accessKeyId: 'id', secretAccessKey: 'secreto', bucket: 'koma', ttlSeconds: TTL });
  for (const key of ['../../etc/passwd', '../x.webp', 'portada.webp', `${newImageKey('webp')}/../x`, newImageKey('png').replace('.png', '.gif')]) {
    await assert.rejects(local.put(key, source, 'image/webp'), /Clave de almacenamiento no válida/, key);
    await assert.rejects(local.signedUrl(key), /Clave de almacenamiento no válida/, key);
    await assert.rejects(r2.put(key, source, 'image/webp'), /Clave de almacenamiento no válida/, key);
    await assert.rejects(r2.signedUrl(key), /Clave de almacenamiento no válida/, key);
  }
  await assert.rejects(readdir(storageDir), { code: 'ENOENT' }); // ni siquiera creó la carpeta
});

test('Seguridad: el driver R2 da URLs prefirmadas de GetObject de su bucket que caducan a los SIGNED_URL_TTL_SECONDS', async () => {
  const r2 = createR2Storage({ accountId: 'cuenta', accessKeyId: 'id', secretAccessKey: 'secreto', bucket: 'koma', ttlSeconds: TTL });
  const key = newImageKey('webp');
  const url = new URL(await r2.signedUrl(key));
  assert.ok(r2ImageHosts('cuenta', 'koma').includes(url.origin), `origen ${url.origin} permitido en img-src`);
  assert.ok(url.pathname.endsWith(`/${key}`));
  assert.equal(url.searchParams.get('X-Amz-Expires'), String(TTL));
  assert.match(url.searchParams.get('X-Amz-Signature') ?? '', /^[0-9a-f]{64}$/);
  assert.match(url.searchParams.get('X-Amz-Credential') ?? '', /^id\/\d{8}\/auto\/s3\/aws4_request$/);
  assert.ok(!url.href.includes('secreto'), 'el secreto nunca va en la URL');
});
