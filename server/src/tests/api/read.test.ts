import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createAdToken } from '../../modules/reading/reading.rules.js';
import { deriveKey } from '../../utils/signing.js';
import { startTestServer } from './helpers.js';
import { createComic, createUser, markRead, type TestComic, type TestUser } from './reading-fixtures.js';

// POST /api/comics/:slug/chapters/:number/read, parte 1 (T11a: RN-01, RN-06, RN-09; contrato del bloque 2)
// contra koma_test. El saldo del registrado (RN-02), los anuncios (RN-03) y los efectos llegan en T11b.
const storageDir = mkdtempSync(path.join(tmpdir(), 'koma-read-'));
process.env['STORAGE_DRIVER'] = 'local';
process.env['STORAGE_LOCAL_DIR'] = storageDir;

const srv = startTestServer();
after(() => rm(storageDir, { recursive: true, force: true }));

interface ReadingBody {
  reading: {
    comic: { slug: string; title: string; contentWarning: string | null };
    chapter: { number: number; title: string; prev: number | null; next: number | null };
    panels: { position: number; url: string; width: number; height: number }[];
    ads: { interstitial: unknown; end: unknown };
    balance: unknown;
  };
}

let comic: TestComic;
let other: TestComic;
let pending: TestComic;
let withdrawn: TestComic;
const users = {} as Record<'reader' | 'premium' | 'admin' | 'author', TestUser>;

before(async () => {
  for (const kind of ['reader', 'premium', 'admin', 'author'] as const) users[kind] = await createUser(kind);
  comic = await createComic({
    name: 'lectura',
    contentWarning: 'Aviso de prueba',
    chapters: [
      { number: 1, title: 'Uno', panels: 3 },
      { number: 2 },
      { number: 3 },
      { number: 4 },
      { number: 5, status: 'pending' },
      { number: 6 }, // el siguiente del 4: el 5 no es público
      { number: 7, status: 'draft' },
      { number: 8, status: 'rejected' },
      { number: 9, withdrawn: true },
      { number: 10, withdrawn: true }, // retirado y sustituido: se lee el nuevo (RN-09)
      { number: 10, title: 'Diez bis' },
    ],
  });
  other = await createComic({ name: 'lectura-otra', chapters: [{ number: 3 }] });
  pending = await createComic({ name: 'lectura-pendiente', status: 'pending', chapters: [{ number: 1 }] });
  withdrawn = await createComic({ name: 'lectura-retirada', withdrawn: true, chapters: [{ number: 1 }] });
});

function read(slug: string, number: string | number, options: { cookie?: string; adToken?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers['Origin'] = options.origin ?? srv.origin;
  if (options.cookie) headers['Cookie'] = options.cookie;
  if (options.adToken !== undefined) headers['X-Ad-Token'] = options.adToken;
  return fetch(`${srv.baseUrl}/api/comics/${slug}/chapters/${number}/read`, { method: 'POST', headers });
}

async function readOk(slug: string, number: number, options: Parameters<typeof read>[2] = {}): Promise<ReadingBody['reading']> {
  const res = await read(slug, number, options);
  assert.equal(res.status, 200, `${slug} cap. ${number}: ${res.status}`);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  return ((await res.json()) as ReadingBody).reading;
}

async function assertError(res: Response, status: number, code: string, label: string): Promise<void> {
  assert.equal(res.status, status, label);
  assert.equal(((await res.json()) as { code: string }).code, code, label);
}

async function adToken(comicId: number, secondsAgo: number): Promise<string> {
  const { env } = await import('../../config/env.js');
  return createAdToken(deriveKey(env.COOKIE_SECRET, 'ad-token'), comicId, new Date(Date.now() - secondsAgo * 1000));
}

test('RN-09: el capítulo llega con sus viñetas en orden, firmadas y con sus medidas, y con el anterior y el siguiente', async () => {
  const reading = await readOk(comic.slug, 1);
  assert.deepEqual(Object.keys(reading).sort(), ['ads', 'balance', 'chapter', 'comic', 'panels']);
  assert.deepEqual(reading.comic, { slug: comic.slug, title: 'Obra lectura', contentWarning: 'Aviso de prueba' });
  assert.deepEqual(reading.chapter, { number: 1, title: 'Uno', prev: null, next: 2 });
  assert.deepEqual(
    reading.panels.map(({ position, width, height }) => [position, width, height]),
    [
      [1, 800, 1001],
      [2, 800, 1002],
      [3, 800, 1003],
    ],
  );
  const keys = comic.panelKeys.get(comic.chapterIds.get('1')!)!;
  reading.panels.forEach((panel, i) => {
    assert.deepEqual(Object.keys(panel).sort(), ['height', 'position', 'url', 'width']);
    assert.match(panel.url, new RegExp(`^/files/${keys[i]}\\?exp=\\d+&sig=[\\w-]{43}$`));
  });
  assert.deepEqual(reading.ads, { interstitial: null, end: null });
  assert.equal(reading.balance, null);

  // La URL firmada sirve la imagen (driver local).
  await writeFile(path.join(storageDir, keys[0]!), 'RIFF....WEBP');
  assert.equal((await fetch(`${srv.baseUrl}${reading.panels[0]!.url}`)).status, 200);

  // Los números pueden saltar: anterior y siguiente son los capítulos públicos más cercanos.
  assert.deepEqual((await readOk(comic.slug, 4, { cookie: users.admin.cookie })).chapter, { number: 4, title: 'Capítulo 4', prev: 3, next: 6 });
  assert.deepEqual((await readOk(comic.slug, 10, { cookie: users.admin.cookie })).chapter, { number: 10, title: 'Diez bis', prev: 6, next: null });
});

test('RN-01: el invitado lee los caps. 1–2 sin anuncio ni cuenta, y cada lectura da URLs firmadas nuevas', async () => {
  const first = await readOk(comic.slug, 2);
  assert.equal(first.chapter.number, 2);
  await new Promise((resolve) => setTimeout(resolve, 1100)); // `exp` va en segundos
  const again = await readOk(comic.slug, 2); // "Recargar" (CU-03)
  assert.notEqual(again.panels[0]!.url, first.panels[0]!.url);
});

test('RN-01: el cap. 3 del invitado exige un X-Ad-Token de esa obra con AD_MIN_SECONDS cumplidos (403 AD_NOT_COMPLETED)', async () => {
  const { env } = await import('../../config/env.js');
  const fromAd = ((await (await fetch(`${srv.baseUrl}/api/comics/${comic.slug}/ad`)).json()) as { adToken: string }).adToken;
  for (const [label, token] of [
    ['sin token', undefined],
    ['token vacío', ''],
    ['token inventado', 'abc.def'],
    ['recién emitido por /ad', fromAd],
    ['un segundo antes del mínimo', await adToken(comic.id, env.AD_MIN_SECONDS - 1)],
    ['de otra obra', await adToken(other.id, env.AD_MIN_SECONDS + 1)],
    ['de hace más de 30 min', await adToken(comic.id, 30 * 60 + 5)],
  ] as const) {
    await assertError(await read(comic.slug, 3, { adToken: token }), 403, 'AD_NOT_COMPLETED', label);
  }
  const reading = await readOk(comic.slug, 3, { adToken: await adToken(comic.id, env.AD_MIN_SECONDS + 1) });
  assert.equal(reading.chapter.number, 3);
  // El token no se acepta en la URL: no debe quedar en los logs.
  const inQuery = await fetch(`${srv.baseUrl}/api/comics/${comic.slug}/chapters/3/read?adToken=${await adToken(comic.id, 60)}`, {
    method: 'POST',
    headers: { Origin: srv.origin },
  });
  await assertError(inQuery, 403, 'AD_NOT_COMPLETED', 'token en la URL');
});

test('RN-01: desde el cap. 4, el invitado recibe 401 UNAUTHENTICATED aunque traiga un token de anuncio', async () => {
  await assertError(await read(comic.slug, 4), 401, 'UNAUTHENTICATED', 'cap. 4');
  await assertError(await read(comic.slug, 6, { adToken: await adToken(comic.id, 60) }), 401, 'UNAUTHENTICATED', 'cap. 6 con token');
  await assertError(await read(comic.slug, 4, { cookie: 'koma_session=no-es-un-jwt' }), 401, 'UNAUTHENTICATED', 'sesión no válida');
});

test('Seguridad: admin y premium leen cualquier capítulo sin anuncio ni saldo', async () => {
  for (const [label, cookie] of [
    ['admin', users.admin.cookie],
    ['premium', users.premium.cookie],
  ] as const) {
    const reading = await readOk(comic.slug, 6, { cookie });
    assert.deepEqual([reading.chapter.number, reading.ads, reading.balance], [6, { interstitial: null, end: null }, null], label);
  }
});

test('Seguridad: la autora lee su propia obra sin anuncios ni saldo; en una ajena, como cualquier registrada', async () => {
  const author = await createUser('author');
  const own = await createComic({ name: 'lectura-propia', authorId: author.id, chapters: [{ number: 1 }, { number: 6 }] });
  for (const number of [1, 6]) {
    const reading = await readOk(own.slug, number, { cookie: author.cookie });
    assert.deepEqual([reading.chapter.number, reading.ads, reading.balance], [number, { interstitial: null, end: null }, null], `cap. ${number}`);
  }
  const { pool } = await import('../../db/pool.js');
  const credits = await pool.query('SELECT 1 FROM reading_credits WHERE user_id = $1', [author.id]);
  assert.equal(credits.rowCount, 0, 'su obra no crea fila de saldo ni cuenta para el intersticial');

  const elsewhere = await readOk(comic.slug, 1, { cookie: author.cookie });
  assert.ok(elsewhere.ads.end, 'en una obra ajena, anuncio final (RN-03)');
  assert.ok(elsewhere.balance, 'y su saldo');
});

test('RN-02: el registrado lee libres los caps. 1–2 y los que ya leyó, sin token de anuncio', async () => {
  const reader = await createUser('reader');
  await readOk(comic.slug, 1, { cookie: reader.cookie });
  await readOk(comic.slug, 2, { cookie: reader.cookie });
  await markRead(reader.id, comic.chapterIds.get('6')!);
  await readOk(comic.slug, 6, { cookie: reader.cookie });
});

test('RN-06: la lectura responde 404 si la obra o el capítulo no existen o no son públicos y 410 si se retiraron', async () => {
  for (const [label, slug, number, status, code] of [
    ['obra inexistente', `no-existe-${comic.slug}`, 1, 404, 'NOT_FOUND'],
    ['obra pendiente', pending.slug, 1, 404, 'NOT_FOUND'],
    ['obra retirada', withdrawn.slug, 1, 410, 'GONE'],
    ['capítulo inexistente', comic.slug, 99, 404, 'NOT_FOUND'],
    ['capítulo pendiente', comic.slug, 5, 404, 'NOT_FOUND'],
    ['capítulo en borrador', comic.slug, 7, 404, 'NOT_FOUND'],
    ['capítulo rechazado', comic.slug, 8, 404, 'NOT_FOUND'],
    ['capítulo retirado', comic.slug, 9, 410, 'GONE'],
    ['número con cero delante', comic.slug, '01', 404, 'NOT_FOUND'],
    ['número cero', comic.slug, '0', 404, 'NOT_FOUND'],
    ['número negativo', comic.slug, '-1', 404, 'NOT_FOUND'],
    ['número decimal', comic.slug, '1.5', 404, 'NOT_FOUND'],
    ['número fuera de INTEGER', comic.slug, '2147483648', 404, 'NOT_FOUND'],
    ['número con carácter nulo', comic.slug, '1%00', 404, 'NOT_FOUND'],
    ['slug no válido', 'Mayusculas', 1, 404, 'NOT_FOUND'],
  ] as const) {
    await assertError(await read(slug, number, { cookie: users.admin.cookie }), status, code, label);
  }
});

test('Seguridad: la lectura es POST y exige un Origin permitido (CSRF); por GET no existe', async () => {
  await assertError(await read(comic.slug, 1, { origin: null }), 403, 'CSRF', 'sin Origin');
  await assertError(await read(comic.slug, 1, { origin: 'https://otro.example' }), 403, 'CSRF', 'otro origen');
  const get = await fetch(`${srv.baseUrl}/api/comics/${comic.slug}/chapters/1/read`);
  await assertError(get, 404, 'NOT_FOUND', 'GET');
});
