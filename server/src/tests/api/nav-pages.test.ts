import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';

// Navegación del bloque 6 (D10) en las páginas servidas: los enlaces a /comunidad y /tutoriales llevan a páginas que
// existen y cada una se marca como activa.
const srv = startTestServer();
const count = (html: string, text: string) => html.split(text).length - 1;
const page = async (path: string) => {
  const res = await fetch(`${srv.baseUrl}${path}`, { redirect: 'manual' });
  return { status: res.status, html: await res.text() };
};

test('Seguridad: (D10) la portada enlaza /comunidad y /tutoriales en la cabecera, la navegación móvil y los accesos rápidos, y los dos destinos responden 200', async () => {
  const home = await page('/');
  assert.equal(home.status, 200);
  for (const href of ['/comunidad', '/tutoriales']) {
    assert.equal(count(home.html, `<a class="site-nav__link" href="${href}">`), 1, `${href}: cabecera`);
    assert.equal(count(home.html, `<a class="mobile-nav__link" href="${href}">`), 1, `${href}: navegación móvil`);
    assert.equal(count(home.html, `<a class="quick-link" href="${href}">`), 1, `${href}: acceso rápido`);
    assert.equal((await page(href)).status, 200, href);
  }
  assert.equal(count(home.html, 'Próximamente'), 0);
});

test('Seguridad: (D10) /comunidad y /tutoriales marcan su enlace como página activa en la cabecera y en la navegación móvil', async () => {
  for (const href of ['/comunidad', '/tutoriales']) {
    const { html } = await page(href);
    assert.equal(count(html, `href="${href}" aria-current="page"`), 2, href);
    assert.equal(count(html, 'aria-current="page"'), 3, `${href}: los dos enlaces y la miga`);
  }
  // Las páginas de error también llevan los enlaces, sin marcar ninguno.
  const missing = await page('/no-existe');
  assert.equal(missing.status, 404);
  assert.equal(count(missing.html, 'href="/comunidad"'), 2);
  assert.equal(count(missing.html, 'href="/tutoriales"'), 2);
});
