import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';

const srv = startTestServer();

const get = (path: string) => fetch(`${srv.baseUrl}${path}`, { redirect: 'manual' });
const title = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];

test('Seguridad: / sirve home.html con el requestId de la petición inyectado', async () => {
  const res = await get('/');
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/);
  assert.equal(title(html), 'Koma');
  assert.ok(html.includes(`<meta name="request-id" content="${res.headers.get('x-request-id')}">`));
  assert.ok(!html.includes('{{'), 'sin marcadores sin rellenar');
});

test('Seguridad: Referrer-Policy es same-origin (con no-referrer, un formulario POST enviaría Origin: null)', async () => {
  for (const path of ['/', '/api/no-existe', '/no-existe']) { // página, error JSON de la API y página de error
    const res = await get(path);
    assert.equal(res.headers.get('referrer-policy'), 'same-origin', path);
  }
});

test('Seguridad: una ruta inexistente responde 404 con su página de error', async () => {
  const res = await get('/no-existe');
  const html = await res.text();
  assert.equal(res.status, 404);
  assert.equal(title(html), 'Página no encontrada · Koma');
  assert.ok(html.includes(`<code>${res.headers.get('x-request-id')}</code>`));
});

test('Seguridad: los HTML de client/public no se sirven directamente', async () => {
  for (const path of ['/pages/home.html', '/errors/404.html', '/styles/../pages/home.html']) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
  }
});

test('Seguridad: la barra final redirige con 301 a la ruta sin ella y conserva la query', async () => {
  const res = await get('/obra/pimienta/?pagina=2');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/obra/pimienta?pagina=2');
});

// Ruta enviada tal cual, sin la normalización de fetch (que convierte `\` en `/`).
function rawGet(path: string): Promise<{ status: number; location: string | undefined }> {
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(srv.baseUrl);
    request({ hostname, port, path, method: 'GET' }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, location: res.headers.location });
    })
      .on('error', reject)
      .end();
  });
}

test('Seguridad: quitar la barra final nunca redirige a otro sitio', async () => {
  for (const path of ['//evil.com/', '///evil.com/', '/\\evil.com/', '/%5Cevil.com/', '/%2F%2Fevil.com/']) {
    const { status, location } = await rawGet(path);
    if (location !== undefined) {
      assert.equal(new URL(location, srv.baseUrl).origin, new URL(srv.baseUrl).origin, `${path} → ${location}`);
    }
    if (path.startsWith('//') || path.startsWith('/\\')) assert.equal(status, 404, path);
  }
});

test('Seguridad: los estáticos de estilos e iconos se sirven con su tipo', async () => {
  const css = await get('/styles/base.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type') ?? '', /^text\/css/);
  const icon = await get('/icons/favicon.svg');
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get('content-type') ?? '', /^image\/svg\+xml/);
});

test('Seguridad: un error sin plantilla usa la página genérica con el mismo layout', async () => {
  const res = await fetch(`${srv.baseUrl}/no-existe`, {
    method: 'POST',
    headers: { Origin: srv.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'a'.repeat(101 * 1024) }),
  });
  const html = await res.text();
  assert.equal(res.status, 413);
  assert.equal(title(html), 'Error 413 · Koma');
  for (const part of ['class="skip-link"', 'class="site-header"', 'class="site-footer"', '/styles/base.css']) {
    assert.ok(html.includes(part), part);
  }
});
