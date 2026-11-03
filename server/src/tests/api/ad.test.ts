import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { verifyAdToken } from '../../modules/reading/reading.rules.js';
import { deriveKey } from '../../utils/signing.js';
import { startTestServer } from './helpers.js';
import { createComic, type TestComic } from './reading-fixtures.js';

// GET /api/comics/:slug/ad (RN-01; contrato del bloque 2) contra koma_test, con los anuncios del seed.

const srv = startTestServer();

interface AdBody {
  ad: { brand: string; body: string; imageUrl: string | null } | null;
  adToken: string;
  minSeconds: number;
}

let comic: TestComic;
let other: TestComic;
let pending: TestComic;
let withdrawn: TestComic;

before(async () => {
  comic = await createComic({ name: 'anuncio', chapters: [{ number: 1 }, { number: 3 }] });
  other = await createComic({ name: 'anuncio-otra' });
  pending = await createComic({ name: 'anuncio-pendiente', status: 'pending' });
  withdrawn = await createComic({ name: 'anuncio-retirada', withdrawn: true });
});

const getAd = (slug: string) => fetch(`${srv.baseUrl}/api/comics/${slug}/ad`);

async function adTokenKey(): Promise<Buffer> {
  const { env } = await import('../../config/env.js');
  return deriveKey(env.COOKIE_SECRET, 'ad-token');
}

test('RN-01: /ad da un anuncio activo, el token de esa obra y los segundos mínimos, sin caché', async () => {
  const startedAt = Date.now();
  const res = await getAd(comic.slug);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = (await res.json()) as AdBody;
  assert.deepEqual(Object.keys(body).sort(), ['ad', 'adToken', 'minSeconds']);
  const { env } = await import('../../config/env.js');
  assert.equal(body.minSeconds, env.AD_MIN_SECONDS);
  assert.ok(body.ad);
  assert.deepEqual(Object.keys(body.ad).sort(), ['body', 'brand', 'imageUrl']);
  assert.equal(body.ad.imageUrl, null); // los del seed son de solo texto

  // El token vale para esta obra cuando han pasado los segundos mínimos, no antes ni para otra.
  const key = await adTokenKey();
  const after = (seconds: number) => new Date(startedAt + seconds * 1000 + 1000);
  assert.equal(verifyAdToken(key, body.adToken, comic.id, after(env.AD_MIN_SECONDS), env.AD_MIN_SECONDS), 'valid');
  assert.equal(verifyAdToken(key, body.adToken, comic.id, new Date(startedAt), env.AD_MIN_SECONDS), 'too-soon');
  assert.equal(verifyAdToken(key, body.adToken, other.id, after(env.AD_MIN_SECONDS), env.AD_MIN_SECONDS), 'other-comic');
});

test('Seguridad: cada petición a /ad da un token nuevo, firmado con la clave ad-token y no con la de files', async () => {
  const first = ((await (await getAd(comic.slug)).json()) as AdBody).adToken;
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = ((await (await getAd(comic.slug)).json()) as AdBody).adToken;
  assert.notEqual(first, second);
  const { env } = await import('../../config/env.js');
  const later = new Date(Date.now() + 60_000);
  assert.equal(verifyAdToken(deriveKey(env.COOKIE_SECRET, 'files'), second, comic.id, later, env.AD_MIN_SECONDS), 'invalid');
});

test('RN-06: /ad responde 404 si la obra no existe o no está aprobada y 410 si se retiró', async () => {
  for (const [slug, status, code] of [
    [`no-existe-${comic.slug}`, 404, 'NOT_FOUND'],
    [pending.slug, 404, 'NOT_FOUND'],
    [withdrawn.slug, 410, 'GONE'],
    ['con%00nulo', 404, 'NOT_FOUND'],
  ] as const) {
    const res = await getAd(slug);
    assert.equal(res.status, status, slug);
    assert.equal(((await res.json()) as { code: string }).code, code, slug);
  }
});
