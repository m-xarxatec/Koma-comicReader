import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';

// Página /comunidad (CU-18 sin reto; contrato del bloque 6, «Páginas»; D7, D8 y D10): pública, sin comprobación en el
// servidor. El tablero, el formulario y «Mis ilustraciones» los resuelve pages/community.ts con la API. Con
// DISCORD_INVITE_URL (env.ts la lee al cargarse), lleva la tarjeta de Discord.
const INVITE = 'https://discord.gg/komaTEST6';
process.env['DISCORD_INVITE_URL'] = INVITE;

const srv = startTestServer();

const get = (path: string) => fetch(`${srv.baseUrl}${path}`, { redirect: 'manual' });
const count = (html: string, text: string) => html.split(text).length - 1;

test('Seguridad: (CU-18) /comunidad es pública y sirve community.html con su título, un solo h1 y el layout común', async () => {
  const res = await get('/comunidad');
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(/<title>([^<]*)<\/title>/.exec(html)?.[1], 'Comunidad · Koma');
  assert.deepEqual([...html.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1]), ['Comunidad']);
  assert.equal(count(html, '<!-- @'), 0, 'marcador de layout');
  assert.equal(count(html, '{{'), 0, 'valor sin rellenar');
  for (const part of ['class="skip-link"', 'class="site-header"', 'class="site-footer"', 'class="mobile-nav"', '<main id="contenido"']) {
    assert.equal(count(html, part), 1, part);
  }
  assert.ok(html.includes(`<meta name="request-id" content="${res.headers.get('x-request-id')}">`), 'requestId inyectado');
});

test('Seguridad: (D7) sin JS, /comunidad invita a entrar con next=/comunidad; el formulario y «Mis ilustraciones» llegan ocultos', async () => {
  const html = await (await get('/comunidad')).text();
  assert.equal(count(html, 'href="/entrar?next=/comunidad"'), 1, 'Entra para compartir');
  assert.match(html, /<form [^>]*data-share-form[^>]* hidden>/, 'formulario oculto hasta saber la sesión');
  assert.match(html, /<form [^>]*method="post"[^>]*>/, 'nunca GET');
  assert.match(html, /<section [^>]*id="mis-ilustraciones"[^>]* hidden>/, '«Mis ilustraciones» oculta');
  assert.match(html, /<input [^>]*name="image"[^>]*type="file"[^>]*accept="image\/png,image\/jpeg,image\/webp"/, 'imagen');
  assert.match(html, /<button [^>]*type="submit"[^>]* disabled data-needs-js>/, 'enviar necesita JS');
  assert.equal(count(html, '<noscript>'), 1, 'aviso sin JavaScript');
});

test('Seguridad: (D8) /comunidad llega sin scripts en línea ni imágenes de usuarios: las pinta su módulo; el detalle es un dialog', async () => {
  const html = await (await get('/comunidad')).text();
  assert.ok(html.includes('<script type="module" src="/js/pages/community.js"></script>'), 'módulo de la página');
  assert.equal([...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)].length, 0, 'sin scripts en línea');
  assert.equal(count(html, '<dialog'), 2, 'detalle y confirmación de la retirada');
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  assert.equal([...main.matchAll(/<img [^>]*src="[^"]/g)].length, 0, 'ninguna imagen con src en el HTML');
  assert.equal((await fetch(`${srv.baseUrl}/js/pages/community.js`)).status, 200, 'el módulo se sirve en /js');
});

test('Seguridad: (D10) con DISCORD_INVITE_URL, /comunidad lleva la tarjeta de Discord además del enlace del pie', async () => {
  const html = await (await get('/comunidad')).text();
  assert.equal(count(html, `href="${INVITE}" target="_blank" rel="noopener noreferrer"`), 2, 'tarjeta y pie');
  assert.equal(count(html, 'class="discord-card"'), 1);
  const other = await (await get('/tutoriales')).text();
  assert.equal(count(other, 'class="discord-card"'), 0, 'solo en /comunidad');
});
