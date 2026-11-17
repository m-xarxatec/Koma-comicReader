import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';

// Página /tutoriales (CU-42; contrato del bloque 6, «Páginas»): pública, sin comprobación en el servidor. La lista la
// pinta pages/tutorials.ts con GET /api/tutorials; el HTML llega sin ningún reproductor.
const srv = startTestServer();

const get = (path: string) => fetch(`${srv.baseUrl}${path}`, { redirect: 'manual' });

test('Seguridad: (CU-42) /tutoriales es pública y sirve tutorials.html con su título, un solo h1 y el layout común', async () => {
  const res = await get('/tutoriales');
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(/<title>([^<]*)<\/title>/.exec(html)?.[1], 'Tutoriales · Koma');
  assert.deepEqual([...html.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1]), ['Tutoriales']);
  assert.equal(html.split('<!-- @').length - 1, 0, 'marcador de layout');
  assert.equal(html.split('{{').length - 1, 0, 'valor sin rellenar');
  for (const part of ['class="skip-link"', 'class="site-header"', 'class="site-footer"', 'class="mobile-nav"', '<main id="contenido"']) {
    assert.equal(html.split(part).length - 1, 1, part);
  }
  assert.ok(html.includes(`<meta name="request-id" content="${res.headers.get('x-request-id')}">`), 'requestId inyectado');
});

test('Seguridad: (CU-42, D12) /tutoriales llega sin reproductores ni scripts en línea: los crea su módulo, y sin JS lo dice', async () => {
  const html = await (await get('/tutoriales')).text();
  assert.ok(html.includes('<script type="module" src="/js/pages/tutorials.js"></script>'), 'módulo de la página');
  assert.equal(html.split('<iframe').length - 1, 0, 'ningún iframe en el HTML');
  assert.equal(html.split('<video').length - 1, 0, 'ningún vídeo en el HTML');
  assert.equal([...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)].length, 0, 'sin scripts en línea');
  assert.equal(html.split('<noscript>').length - 1, 1, 'aviso sin JavaScript');
  assert.equal(html.split('role="status"').length - 1, 1, 'una sola región de estado');
  assert.equal((await fetch(`${srv.baseUrl}/js/pages/tutorials.js`)).status, 200, 'el módulo se sirve en /js');
});

test('Seguridad: (CU-42) /tutoriales/ redirige con 301 a la ruta sin barra final', async () => {
  const res = await get('/tutoriales/');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/tutoriales');
});
