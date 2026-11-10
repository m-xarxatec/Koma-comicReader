import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { startTestServer } from './helpers.js';
import { createComic, createUser, type TestComic, type TestUser } from './reading-fixtures.js';

// Open Graph (CU-06; contrato del bloque 5, D8 y D9) en las páginas servidas, contra koma_test.
const srv = startTestServer();

const db = async () => (await import('../../db/pool.js')).pool;
const APP_URL = process.env['APP_URL'] ?? '';
const origin = new URL(APP_URL).origin;

const page = (url: string, user?: TestUser) => fetch(`${srv.baseUrl}${url}`, { redirect: 'manual', ...(user && { headers: { Cookie: user.cookie } }) });
const meta = (html: string, property: string) =>
  new RegExp(`<meta (?:property|name)="${property.replaceAll(':', '\\:')}" content="([^"]*)">`).exec(html)?.[1];

const HOSTILE = `"><script>alert('x')</script>&amp;`;
const ESCAPED = '&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;amp;';

let owner: TestUser;
let hostileComic: TestComic;
let pendingComic: TestComic;
let withdrawnComic: TestComic;

before(async () => {
  owner = await createUser('author');
  hostileComic = await createComic({ name: 'og-hostil', title: HOSTILE, authorId: owner.id, chapters: [{ number: 1 }] });
  await (await db()).query('UPDATE comics SET synopsis = $2 WHERE id = $1', [hostileComic.id, `${HOSTILE}\n\nSegunda línea`]);
  pendingComic = await createComic({ name: 'og-pendiente', title: 'Obra secreta en revisión', status: 'pending', authorId: owner.id, chapters: [{ number: 1 }] });
  withdrawnComic = await createComic({ name: 'og-retirada', title: 'Obra retirada OG', withdrawn: true, chapters: [{ number: 1 }] });
});

test('Seguridad: / lleva og:* con texto fijo, URLs absolutas de APP_URL y las medidas de la imagen', async () => {
  const res = await page('/');
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(meta(html, 'og:site_name'), 'Koma');
  assert.equal(meta(html, 'og:locale'), 'es_ES');
  assert.equal(meta(html, 'og:type'), 'website');
  assert.equal(meta(html, 'og:title'), 'Koma');
  assert.equal(meta(html, 'og:description'), 'Koma: descubre cómics gratuitos, explora historias y comparte tu creatividad.');
  assert.equal(meta(html, 'og:url'), `${origin}/`);
  assert.equal(meta(html, 'og:image'), `${origin}/icons/koma-og.png`);
  assert.equal(meta(html, 'og:image:width'), '1200');
  assert.equal(meta(html, 'og:image:height'), '630');
  assert.equal(meta(html, 'og:image:alt'), 'Koma, plataforma de cómics');
  assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
  // La imagen se sirve de verdad, como PNG.
  const image = await page('/icons/koma-og.png');
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
});

test('Seguridad: /obra/:slug con título y sinopsis hostiles los escapa en og:title y og:description', async () => {
  const res = await page(`/obra/${hostileComic.slug}`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(meta(html, 'og:title'), ESCAPED);
  assert.equal(meta(html, 'og:description'), `${ESCAPED} Segunda línea`, 'saltos de línea convertidos en un espacio');
  assert.equal(meta(html, 'og:url'), `${origin}/obra/${hostileComic.slug}`);
  assert.equal(meta(html, 'og:image'), `${origin}/icons/koma-og.png`);
  assert.ok(!html.includes('<script>alert'), 'ningún script inyectado');
});

test('Seguridad: /leer/:slug/:numero lleva obra y capítulo en og:*, escapados', async () => {
  const res = await page(`/leer/${hostileComic.slug}/1`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(meta(html, 'og:title'), `${ESCAPED} · Capítulo 1`);
  assert.equal(meta(html, 'og:description'), `Lee el capítulo 1 de ${ESCAPED} en Koma.`);
  assert.equal(meta(html, 'og:url'), `${origin}/leer/${hostileComic.slug}/1`);
  assert.ok(!html.includes('<script>alert'), 'ningún script inyectado');
});

test('Seguridad: una obra pending sin sesión sigue dando 404 en /obra y /leer, sin sus datos ni meta og:*', async () => {
  for (const url of [`/obra/${pendingComic.slug}`, `/leer/${pendingComic.slug}/1`]) {
    const res = await page(url);
    const html = await res.text();
    assert.equal(res.status, 404, url);
    assert.ok(!html.includes('Obra secreta'), `${url}: sin el título`);
    assert.ok(!html.includes('property="og:'), `${url}: sin og:*`);
    assert.ok(!html.includes('twitter:card'), `${url}: sin twitter:card`);
  }
  // Su dueño sí la ve (vista previa, D10), con sus meta: no se comparte, porque nadie más puede abrirla.
  const res = await page(`/obra/${pendingComic.slug}`, owner);
  assert.equal(res.status, 200);
  assert.equal(meta(await res.text(), 'og:title'), 'Obra secreta en revisión');
});

test('Seguridad: las páginas de error (404 y 410) no llevan meta og:*', async () => {
  for (const [url, status] of [
    ['/obra/no-existe-og', 404],
    [`/obra/${withdrawnComic.slug}`, 410],
    [`/leer/${hostileComic.slug}/99`, 404],
    ['/ruta-inexistente', 404],
  ] as const) {
    const res = await page(url);
    const html = await res.text();
    assert.equal(res.status, status, url);
    assert.ok(!html.includes('property="og:'), `${url}: sin og:*`);
    assert.ok(!html.includes('{{'), `${url}: sin marcadores`);
  }
});
