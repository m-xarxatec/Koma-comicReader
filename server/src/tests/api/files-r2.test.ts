import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newImageKey } from '../../utils/image.js';
import { startTestServer } from './helpers.js';

// Con STORAGE_DRIVER=r2 (credenciales ficticias: nada sale a la red) /files no existe y la CSP permite
// justo el origen de las URLs prefirmadas que genera el driver.
process.env['STORAGE_DRIVER'] = 'r2';
process.env['R2_ACCOUNT_ID'] = 'cuentaprueba';
process.env['R2_ACCESS_KEY_ID'] = 'id-prueba';
process.env['R2_SECRET_ACCESS_KEY'] = 'secreto-prueba';
process.env['R2_BUCKET'] = 'koma-prueba';

const srv = startTestServer();

test('Seguridad: con el driver r2, /files/:key no existe (404)', async () => {
  const res = await fetch(`${srv.baseUrl}/files/${newImageKey('webp')}?exp=9999999999&sig=x`);
  assert.equal(res.status, 404);
});

test('Seguridad: con el driver r2, img-src de la CSP incluye el origen de las URLs prefirmadas y nada más externo', async () => {
  const { storage } = await import('../../integrations/storage/index.js');
  const { origin } = new URL(await storage.signedUrl(newImageKey('webp')));
  const csp = (await fetch(`${srv.baseUrl}/`)).headers.get('content-security-policy') ?? '';
  const imgSrc = /(?:^|;)img-src ([^;]*)/.exec(csp)?.[1]?.split(' ') ?? [];
  assert.ok(imgSrc.includes(origin), `${origin} en img-src (${imgSrc.join(' ')})`);
  assert.ok(imgSrc.every((source) => source === "'self'" || source.endsWith('.r2.cloudflarestorage.com')), imgSrc.join(' '));
});
