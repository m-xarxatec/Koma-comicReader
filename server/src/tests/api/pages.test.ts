import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { api, sessionCookie, startTestServer } from './helpers.js';

const srv = startTestServer();

const get = (path: string, cookie?: string) =>
  fetch(`${srv.baseUrl}${path}`, { redirect: 'manual', ...(cookie && { headers: { Cookie: cookie } }) });
const title = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];
const h1s = (html: string) => [...html.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1]);

// Cuenta demo que ningún otro archivo de test modifica (auth.test suspende a author y cambia a admin).
const PREMIUM = { email: 'premium@demo.test', password: process.env['SEED_PREMIUM_PASSWORD'] ?? '' };

test('Seguridad: /entrar y /registro sirven auth.html con su título, su único h1 y su modo', async () => {
  for (const [path, mode, heading] of [
    ['/entrar', 'login', 'Entrar'],
    ['/registro', 'register', 'Crear cuenta'],
  ] as const) {
    const res = await get(path);
    const html = await res.text();
    assert.equal(res.status, 200, path);
    assert.equal(title(html), `${heading} · Koma`, path);
    assert.deepEqual(h1s(html), [heading], path);
    assert.ok(html.includes(`<body data-mode="${mode}">`), path);
    assert.ok(!html.includes('{{'), `${path}: sin marcadores sin rellenar`);
    // Nunca GET: sin JS, la contraseña no puede acabar en la URL ni en los logs.
    assert.equal(html.match(/<form [^>]*method="post"/g)?.length, 2, path);
  }
});

test('Seguridad: ninguna página servida sale con un marcador sin sustituir', async () => {
  const pages: [string, Response][] = [
    ['/', await get('/')],
    ['/entrar', await get('/entrar')],
    ['/registro', await get('/registro')],
    ['/no-existe (404)', await get('/no-existe')],
    [
      'POST 413 (página genérica)',
      await fetch(`${srv.baseUrl}/no-existe`, {
        method: 'POST',
        headers: { Origin: srv.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'a'.repeat(101 * 1024) }),
      }),
    ],
  ];
  for (const [name, res] of pages) {
    const html = await res.text();
    assert.equal(html.split('<!-- @').length - 1, 0, `${name}: marcador de layout`);
    assert.equal(html.split('{{').length - 1, 0, `${name}: valor sin rellenar`);
    for (const part of ['class="skip-link"', 'class="site-header"', 'class="site-footer"', 'class="mobile-nav"']) {
      assert.equal(html.split(part).length - 1, 1, `${name}: ${part}`);
    }
    assert.equal(html.split('data-login-link').length - 1, 2, `${name}: Entrar y Registrarse`);
  }
});

test('Seguridad: con sesión, /entrar y /registro redirigen con 303 a next si es seguro y, si no, a /', async () => {
  const cookie = sessionCookie(await api(srv, 'POST', '/api/auth/login', { body: PREMIUM }));
  assert.notEqual(cookie, '');
  for (const [path, location] of [
    ['/entrar', '/'],
    ['/registro?next=/perfil', '/perfil'],
    ['/entrar?next=%2Fleer%2Fpimienta%2F3%23v-4', '/leer/pimienta/3#v-4'],
    ['/entrar?next=//evil.com', '/'],
    ['/entrar?next=https://evil.com', '/'],
  ] as const) {
    const res = await get(path, cookie);
    assert.equal(res.status, 303, path);
    assert.equal(res.headers.get('location'), location, path);
  }
});

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
  assert.equal(title(html), 'Página perdida · Koma');
  assert.ok(html.includes(`<code class="error-copy__reference-code">${res.headers.get('x-request-id')}</code>`));
  assert.ok(!html.includes('aria-current'), 'una ruta que no existe no marca ninguna página como activa');
});

test('Seguridad: el servidor marca la página activa (aria-current) en la cabecera y en la navegación móvil', async () => {
  const home = await (await get('/')).text();
  assert.equal(home.split('aria-current="page"').length - 1, 2, '/');
  const login = await (await get('/entrar')).text();
  assert.equal(login.split('aria-current="page"').length - 1, 0, '/entrar no está en la navegación');
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
  for (const [path, type] of [
    ['/icons/favicon.svg', /^image\/svg\+xml/],
    ['/icons/sprite.svg', /^image\/svg\+xml/],
    ['/icons/koma-logo.webp', /^image\/webp/],
    ['/icons/error-404.webp', /^image\/webp/],
  ] as const) {
    const icon = await get(path);
    assert.equal(icon.status, 200, path);
    assert.match(icon.headers.get('content-type') ?? '', type, path);
  }
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
  for (const part of ['class="skip-link"', 'class="site-header"', 'class="site-footer"', 'class="mobile-nav"', 'name="theme-color"', '/styles/layers.css', '/styles/base.css', `<code class="error-copy__reference-code">${res.headers.get('x-request-id')}</code>`]) {
    assert.ok(html.includes(part), part);
  }
  // Mismo orden de hojas que las plantillas de client/public (lo comprueba layout.test.ts): tokens, capas y base.
  const tokens = html.indexOf('href="/styles/variables.css"');
  const layers = html.indexOf('href="/styles/layers.css"');
  const base = html.indexOf('href="/styles/base.css"');
  assert.ok(tokens >= 0 && tokens < layers && layers < base, 'orden variables → layers → base');
});
