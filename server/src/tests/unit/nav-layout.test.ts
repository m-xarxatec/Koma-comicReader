import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';
import { COMMUNITY_MARKER, FOOTER_MARKER, HEAD_MARKER, HEADER_MARKER, renderTemplate } from '../../utils/layout.js';

// Navegación del bloque 6 (contrato, «Páginas» y D10): «Comunidad» y «Tutoriales» en la cabecera, en la navegación
// móvil y en los accesos rápidos de la portada. Discord queda en el pie y dentro de /comunidad.
const INVITE = 'https://discord.gg/abcDEF123';
const count = (html: string, text: string) => html.split(text).length - 1;
const chrome = `<head>${HEAD_MARKER}</head><body>${HEADER_MARKER}${FOOTER_MARKER}</body>`;

test('Seguridad: (D10) «Comunidad» y «Tutoriales» salen en la cabecera y en la navegación móvil, sin depender de JS', () => {
  const html = renderTemplate(chrome, {}, '/');
  for (const [href, label, icon] of [
    ['/comunidad', 'Comunidad', 'users'],
    ['/tutoriales', 'Tutoriales', 'cap'],
  ] as const) {
    assert.equal(count(html, `<a class="site-nav__link" href="${href}">`), 1, `${label} en la cabecera`);
    assert.equal(count(html, `<a class="mobile-nav__link" href="${href}">`), 1, `${label} en la navegación móvil`);
    assert.equal(count(html, `#icon-${icon}"/></svg><span>${label}</span></a>`), 2, `${label}: icono y texto`);
  }
  // El orden de la navegación: Inicio, Explorar, Comunidad, Tutoriales y Crear.
  const order = [...html.matchAll(/<a class="site-nav__link[^"]*" href="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(order, ['/', '/#catalogo', '/comunidad', '/tutoriales', '/crear']);
});

test('Seguridad: (D10) aria-current marca «Comunidad» en /comunidad y «Tutoriales» en /tutoriales, y solo esa', () => {
  for (const route of ['/comunidad', '/tutoriales']) {
    const html = renderTemplate(chrome, {}, route);
    assert.equal(count(html, `href="${route}" aria-current="page"`), 2, route);
    assert.equal(count(html, 'aria-current'), 2, `${route}: ninguna otra`);
    assert.equal(count(html, `<a class="site-nav__link site-nav__link--active" href="${route}"`), 1, route);
  }
});

test('Seguridad: (D10) el acceso rápido «Comunidad» lleva a /comunidad, con URL de Discord o sin ella, y nunca abre otra pestaña', () => {
  for (const discord of [null, INVITE]) {
    const html = renderTemplate(`<main>${COMMUNITY_MARKER}</main>`, {}, '/', discord);
    assert.equal(count(html, '<a class="quick-link" href="/comunidad">'), 1, String(discord));
    assert.equal(count(html, '<strong>Comunidad</strong>'), 1, String(discord));
    assert.equal(count(html, 'target="_blank"'), 0, String(discord));
    assert.equal(count(html, 'discord'), 0, String(discord));
    assert.equal(count(html, 'Próximamente'), 0, String(discord));
  }
});

test('Seguridad: (D10) en la portada, «Tutoriales» es un enlace a /tutoriales y ya nada dice «Próximamente»', async () => {
  const template = await readFile(path.join(paths.publicDir, 'pages', 'home.html'), 'utf8');
  const html = renderTemplate(template, {}, '/');
  const links = html.slice(html.indexOf('<nav class="quick-links"'), html.indexOf('</nav>', html.indexOf('<nav class="quick-links"')));
  assert.equal(count(links, '<a class="quick-link" href="/tutoriales">'), 1);
  assert.equal(count(links, '<a class="quick-link" href="/comunidad">'), 1);
  assert.equal(count(links, '<a class="quick-link"'), 4, 'Leer, Crear, Comunidad y Tutoriales');
  assert.equal(count(html, 'quick-link--soon'), 0);
  assert.equal(count(html, 'Próximamente'), 0);
});
