import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { newImageKey } from '../../utils/image.js';
import { deriveKey, sign, signExpiring } from '../../utils/signing.js';
import { startTestServer } from './helpers.js';

// GET /files/:key con el driver local (contrato del bloque 2). Las imágenes van a un directorio temporal:
// env.ts se carga en before() de startTestServer, después de fijar aquí las variables.
const storageDir = mkdtempSync(path.join(tmpdir(), 'koma-files-'));
process.env['STORAGE_DRIVER'] = 'local';
process.env['STORAGE_LOCAL_DIR'] = storageDir;

const srv = startTestServer();
after(() => rm(storageDir, { recursive: true, force: true }));

const IMAGE = Buffer.from('RIFF....WEBPVP8 imagen de prueba');
const nowSeconds = () => Math.floor(Date.now() / 1000);

async function storeImage(): Promise<{ key: string; url: string }> {
  const { storage } = await import('../../integrations/storage/index.js');
  const key = newImageKey('webp');
  const source = path.join(storageDir, 'origen.tmp');
  await writeFile(source, IMAGE);
  await storage.put(key, source, 'image/webp');
  return { key, url: await storage.signedUrl(key) };
}

async function filesKey(label: 'files' | 'ad-token' = 'files'): Promise<Buffer> {
  const { env } = await import('../../config/env.js');
  return deriveKey(env.COOKIE_SECRET, label);
}

const get = (url: string) => fetch(`${srv.baseUrl}${url}`);

test('Seguridad: /files sirve la imagen con su URL firmada, en caché privada hasta que caduca', async () => {
  const { url } = await storeImage();
  const res = await get(url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/webp');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const maxAge = Number(/^private, max-age=(\d+)$/.exec(res.headers.get('cache-control') ?? '')?.[1]);
  const { env } = await import('../../config/env.js');
  assert.ok(maxAge > env.SIGNED_URL_TTL_SECONDS - 5 && maxAge <= env.SIGNED_URL_TTL_SECONDS, `max-age=${maxAge}`);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), IMAGE);
});

test('Seguridad: /files responde 403 sin firma, con la firma alterada, de otro uso o con exp cambiado', async () => {
  const { key, url } = await storeImage();
  const { searchParams } = new URL(url, srv.baseUrl);
  const exp = searchParams.get('exp')!;
  const sig = searchParams.get('sig')!;
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  const adTokenSig = signExpiring(await filesKey('ad-token'), key, Number(exp));
  for (const [name, query] of [
    ['sin query', ''],
    ['sin firma', `?exp=${exp}`],
    ['sin exp', `?sig=${sig}`],
    ['firma alterada', `?exp=${exp}&sig=${flipped}`],
    ['exp cambiado', `?exp=${Number(exp) + 3600}&sig=${sig}`],
    ['exp con cero a la izquierda', `?exp=0${exp}&sig=${sig}`],
    ['exp no numérico', `?exp=abc&sig=${sig}`],
    ['firma con la clave de otro uso', `?exp=${exp}&sig=${adTokenSig}`],
    ['parámetros repetidos', `?exp=${exp}&exp=${exp}&sig=${sig}`],
  ] as const) {
    assert.equal((await get(`/files/${key}${query}`)).status, 403, name);
  }
});

test('Seguridad: /files responde 403 a una URL bien firmada que ya caducó', async () => {
  const { key } = await storeImage();
  const exp = nowSeconds() - 1;
  const res = await get(`/files/${key}?exp=${exp}&sig=${signExpiring(await filesKey(), key, exp)}`);
  assert.equal(res.status, 403);
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/); // fuera de /api: página de error
});

test('Seguridad: /files valida la clave antes que la firma y antes de tocar el disco: 404 aunque esté firmada', async () => {
  const key = await filesKey();
  const exp = nowSeconds() + 60;
  for (const candidate of ['../../etc/passwd', '..%2F..%2Fetc%2Fpasswd', 'portada.webp', newImageKey('webp').toUpperCase(), newImageKey('png').replace('.png', '.gif'), '.env']) {
    const decoded = decodeURIComponent(candidate);
    const res = await get(`/files/${candidate}?exp=${exp}&sig=${signExpiring(key, decoded, exp)}`);
    assert.equal(res.status, 404, candidate);
  }
});

test('Seguridad: /files responde 404 a una clave válida y bien firmada que no existe', async () => {
  const missing = newImageKey('webp');
  const exp = nowSeconds() + 60;
  const res = await get(`/files/${missing}?exp=${exp}&sig=${signExpiring(await filesKey(), missing, exp)}`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
});

test('Seguridad: una firma sin caducidad (sign) no sirve como URL de /files', async () => {
  const { key } = await storeImage();
  const exp = nowSeconds() + 60;
  const res = await get(`/files/${key}?exp=${exp}&sig=${sign(await filesKey(), key)}`);
  assert.equal(res.status, 403);
});
