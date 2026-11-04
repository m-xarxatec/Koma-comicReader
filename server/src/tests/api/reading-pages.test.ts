import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { startTestServer } from './helpers.js';
import { createComic, type TestComic } from './reading-fixtures.js';

// Páginas /obra/:slug, /leer/:slug y /leer/:slug/:numero (mapa de rutas HTML; T12) contra koma_test.

const srv = startTestServer();

const get = (path: string) => fetch(`${srv.baseUrl}${path}`, { redirect: 'manual' });
const title = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];
const h1s = (html: string) => [...html.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1]);

const HOSTILE = `<script>alert("x")</script> & 'Ñandú'`;
const ESCAPED = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;Ñandú&#39;';

let comic: TestComic;
let plain: TestComic;
let pending: TestComic;
let withdrawn: TestComic;

before(async () => {
  comic = await createComic({
    name: 'pagina',
    title: HOSTILE,
    contentWarning: `Aviso <b>fuerte</b>`,
    chapters: [{ number: 1, title: `Uno "<i>"` }, { number: 5 }, { number: 6, status: 'pending' }, { number: 7, withdrawn: true }],
  });
  plain = await createComic({ name: 'pagina-sin-aviso', chapters: [{ number: 2 }] });
  pending = await createComic({ name: 'pagina-pendiente', status: 'pending', chapters: [{ number: 1 }] });
  withdrawn = await createComic({ name: 'pagina-retirada', withdrawn: true, chapters: [{ number: 1 }] });
});

async function page(path: string, status = 200): Promise<string> {
  const res = await get(path);
  assert.equal(res.status, status, path);
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/, path);
  const html = await res.text();
  assert.equal(html.split('{{').length - 1, 0, `${path}: valor sin rellenar`);
  assert.equal(html.split('<!-- @').length - 1, 0, `${path}: marcador de layout`);
  return html;
}

test('Seguridad: /obra/:slug sirve la ficha con el título escapado en <title>, en su único <h1>, en las migas y en la descripción', async () => {
  const html = await page(`/obra/${comic.slug}`);
  assert.equal(title(html), `${ESCAPED} · Koma`);
  assert.deepEqual(h1s(html), [ESCAPED]);
  assert.ok(html.includes(`<span class="breadcrumb__current" aria-current="page">${ESCAPED}</span>`), 'migas');
  assert.ok(html.includes(`<meta name="description" content="Ficha de ${ESCAPED} en Koma`), 'descripción (atributo)');
  assert.ok(!html.includes('<script>alert'), 'nada sin escapar');
  for (const part of ['class="skip-link"', 'id="contenido"', 'class="site-footer"', '<html lang="es">', 'rel="icon"']) {
    assert.ok(html.includes(part), part);
  }
});

test('RN-06: /obra/:slug responde la página 404 si la obra no existe, no está aprobada o el slug no es válido, y la 410 si se retiró', async () => {
  for (const path of [`/obra/no-existe-${plain.slug}`, `/obra/${pending.slug}`, '/obra/Mayusculas', '/obra/con%00nulo']) await page(path, 404);
  await page(`/obra/${withdrawn.slug}`, 410);
});

test('RN-09: /leer/:slug redirige con 301 al capítulo 1; 404 o 410 si la obra no es pública', async () => {
  const res = await get(`/leer/${comic.slug}`);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), `/leer/${comic.slug}/1`);
  await page(`/leer/no-existe-${plain.slug}`, 404);
  await page(`/leer/${pending.slug}`, 404);
  await page(`/leer/${withdrawn.slug}`, 410);
  // Con barra final, primero la redirección del mapa de rutas.
  const slash = await get(`/leer/${comic.slug}/`);
  assert.deepEqual([slash.status, slash.headers.get('location')], [301, `/leer/${comic.slug}`]);
});

test('RN-08: /leer/:slug/:numero inyecta escapados el título, el capítulo y la advertencia', async () => {
  const html = await page(`/leer/${comic.slug}/1`);
  assert.equal(title(html), `${ESCAPED} · Capítulo 1 · Koma`);
  assert.deepEqual(h1s(html), ['Uno &quot;&lt;i&gt;&quot;']);
  assert.ok(html.includes(`<p class="reader-page__eyebrow">${ESCAPED} <span aria-hidden="true">/</span> Capítulo 1</p>`), 'obra y capítulo');
  assert.ok(html.includes(`href="/obra/${comic.slug}"`), 'Volver a la obra, sin JS');
  assert.ok(html.includes('<p data-content-warning hidden>Aviso &lt;b&gt;fuerte&lt;/b&gt;</p>'));
  assert.ok(html.includes(`<p data-comic-title hidden>${ESCAPED}</p>`), 'título para compartir viñeta (CU-06)');
  assert.ok(html.includes('<dialog class="comments-dialog" id="comments-dialog"'), 'panel de comentarios (CU-05)');
  const noWarning = await page(`/leer/${plain.slug}/2`);
  assert.ok(noWarning.includes('<p data-content-warning hidden></p>'));
});

test('RN-01: la página de un capítulo de pago carga para el invitado: el permiso lo decide la API', async () => {
  await page(`/leer/${comic.slug}/5`);
});

test('RN-06: /leer/:slug/:numero responde 404 si el capítulo no existe o no es público y 410 si se retiró', async () => {
  for (const number of ['99', '6', '01', '0', 'uno', '2147483648']) await page(`/leer/${comic.slug}/${number}`, 404);
  await page(`/leer/${comic.slug}/7`, 410);
  await page(`/leer/${withdrawn.slug}/1`, 410);
});
