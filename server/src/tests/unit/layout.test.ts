import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';
import { FOOTER_MARKER, HEAD_MARKER, HEADER_MARKER, renderTemplate, THEME_COLOR } from '../../utils/layout.js';

// Todas las plantillas que sirve el servidor: páginas (sendPage) y errores (error-handler).
async function templates(): Promise<{ file: string; html: string }[]> {
  const result: { file: string; html: string }[] = [];
  for (const dir of ['pages', 'errors']) {
    for (const name of (await readdir(path.join(paths.publicDir, dir))).filter((file) => file.endsWith('.html'))) {
      result.push({ file: `${dir}/${name}`, html: await readFile(path.join(paths.publicDir, dir, name), 'utf8') });
    }
  }
  return result;
}

// Todos los valores que inyecta el servidor en alguna plantilla (auth, comic y reader).
const VALUES = {
  requestId: '00000000-0000-4000-8000-000000000000',
  mode: 'login',
  title: 'Entrar',
  heading: 'Entrar',
  slug: 'obra',
  comicTitle: 'Obra',
  chapterTitle: 'Capítulo 1',
  number: '1',
  contentWarning: '',
  // profile.html (profilePageValues en users.service.ts)
  displayName: 'Ana',
  email: 'ana@demo.test',
  initials: 'A',
  accountLabel: 'Cuenta de lectura',
  plan: 'free',
  premiumUntil: '',
  premiumUntilDate: '',
  // author.html (authorPage en comics.controller.ts)
  authorCredit: 'Ana',
  // become-author.html (createPage en comics.controller.ts)
  howTo: 'El rol de autor lo activa un administrador.',
};
const count = (html: string, text: string) => html.split(text).length - 1;

// Excepción explícita (D20): el lector lleva @head, pero su propia barra (header.reader-topbar) en lugar de la
// cabecera, el pie y la navegación móvil del sitio, que taparía la tira. Ninguna otra plantilla.
const OWN_CHROME = new Set(['pages/reader.html']);

test('Seguridad: cada plantilla lleva una vez cada marcador y ninguna copia propia de la cabecera o el pie', async () => {
  const all = await templates();
  assert.ok(all.length >= 7, `plantillas encontradas: ${all.length}`);
  assert.ok(all.some(({ file }) => OWN_CHROME.has(file)), 'la excepción apunta a una plantilla que existe');
  for (const { file, html } of all) {
    assert.equal(count(html, HEAD_MARKER), 1, `${file}: ${HEAD_MARKER}`);
    assert.ok(html.indexOf(HEAD_MARKER) < html.indexOf('</head>'), `${file}: ${HEAD_MARKER} fuera de <head>`);
    const chrome = OWN_CHROME.has(file) ? 0 : 1;
    assert.equal(count(html, HEADER_MARKER), chrome, `${file}: ${HEADER_MARKER}`);
    assert.equal(count(html, FOOTER_MARKER), chrome, `${file}: ${FOOTER_MARKER}`);
    assert.equal(count(html, 'class="site-header"'), 0, `${file}: cabecera copiada`);
    assert.equal(count(html, 'class="site-footer"'), 0, `${file}: pie copiado`);
  }
});

// Sin @import (las hojas se cargan en serie): cada plantilla enlaza las capas entre los tokens y la base.
test('Seguridad: cada plantilla enlaza layers.css después de variables.css y antes de base.css, y ningún CSS usa @import', async () => {
  for (const { file, html } of await templates()) {
    const tokens = html.indexOf('href="/styles/variables.css"');
    const layers = html.indexOf('href="/styles/layers.css"');
    const base = html.indexOf('href="/styles/base.css"');
    assert.equal(count(html, 'href="/styles/layers.css"'), 1, `${file}: layers.css`);
    assert.ok(tokens >= 0 && tokens < layers && layers < base, `${file}: orden variables → layers → base`);
  }
  const stylesDir = path.join(paths.publicDir, 'styles');
  const sheets = (await readdir(stylesDir, { recursive: true })).filter((name) => name.endsWith('.css'));
  assert.ok(sheets.length >= 10, `hojas encontradas: ${sheets.length}`);
  for (const name of sheets) {
    assert.ok(!(await readFile(path.join(stylesDir, name), 'utf8')).includes('@import'), `${name}: @import`);
  }
});

test('Seguridad: ninguna plantilla sale con un marcador sin sustituir', async () => {
  for (const { file, html } of await templates()) {
    const rendered = renderTemplate(html, VALUES);
    assert.equal(count(rendered, '<!-- @'), 0, `${file}: marcador de layout`);
    assert.equal(count(rendered, '{{'), 0, `${file}: valor sin rellenar`);
    assert.equal(count(rendered, 'class="skip-link"'), 1, `${file}: skip-link`);
    assert.equal(count(rendered, 'href="#contenido"'), 1, `${file}: "Saltar al contenido" a #contenido`);
    assert.equal(count(rendered, 'id="contenido"'), 1, `${file}: id="contenido"`);
    const own = OWN_CHROME.has(file);
    assert.equal(count(rendered, 'class="reader-topbar"'), own ? 1 : 0, `${file}: barra del lector`);
    for (const part of ['class="site-header"', 'class="site-footer"', 'class="mobile-nav"', 'src="/js/components/header.js"']) {
      assert.equal(count(rendered, part), own ? 0 : 1, `${file}: ${part}`);
    }
    assert.equal(count(rendered, 'name="theme-color"'), 1, `${file}: theme-color`);
  }
});

test('Seguridad: aria-current marca solo la página de la ruta, en la cabecera y en la navegación móvil', () => {
  const html = `<head>${HEAD_MARKER}</head><body>${HEADER_MARKER}${FOOTER_MARKER}</body>`;
  assert.equal(count(renderTemplate(html, {}, '/'), 'aria-current="page"'), 2, '/');
  assert.equal(count(renderTemplate(html, {}, '/'), 'site-nav__link--active'), 1, '/');
  for (const path of ['', '/entrar', '/no-existe', '/obra/x']) {
    assert.equal(count(renderTemplate(html, {}, path), 'aria-current'), 0, path);
  }
  // "Crear" lleva a /crear, y está activo en /crear y en el estudio (/autor).
  for (const path of ['/crear', '/autor']) {
    assert.equal(count(renderTemplate(html, {}, path), 'href="/crear" aria-current="page"'), 2, path);
  }
});

test('Seguridad: "Crear" sale para todos en la cabecera y en la navegación móvil, sin depender de JS', () => {
  const rendered = renderTemplate(`<head>${HEAD_MARKER}</head><body>${HEADER_MARKER}${FOOTER_MARKER}</body>`, {}, '/');
  assert.equal(count(rendered, 'href="/crear"'), 2);
  assert.equal(count(rendered, '#icon-pencil'), 2);
});

// Excepción a "todo valor visual en variables.css": theme-color va en un <meta> de layout.ts y repite el
// --color-bg. Este test es el que mantiene los dos sitios iguales.
test('Seguridad: theme-color de layout.ts coincide con --color-bg de variables.css', async () => {
  const css = await readFile(path.join(paths.publicDir, 'styles', 'variables.css'), 'utf8');
  const values = [...css.matchAll(/--color-bg:\s*(#[0-9a-f]{6})/gi)].map((match) => match[1]?.toLowerCase());
  assert.deepEqual(values, [THEME_COLOR], 'un solo --color-bg, igual que theme-color');
});

// Solo tema oscuro (CLAUDE.md, convenciones de CSS): ninguna hoja cambia con prefers-color-scheme.
test('Seguridad: solo tema oscuro: color-scheme: dark y ninguna variante por prefers-color-scheme', async () => {
  const stylesDir = path.join(paths.publicDir, 'styles');
  const variables = await readFile(path.join(stylesDir, 'variables.css'), 'utf8');
  assert.match(variables, /:root\s*\{\s*color-scheme:\s*dark;/, 'variables.css declara color-scheme: dark');
  const sheets = (await readdir(stylesDir, { recursive: true })).filter((name) => name.endsWith('.css'));
  for (const name of sheets) {
    const css = await readFile(path.join(stylesDir, name), 'utf8');
    assert.ok(!css.includes('prefers-color-scheme'), `${name}: prefers-color-scheme`);
    assert.ok(!/color-scheme:\s*light/.test(css), `${name}: color-scheme light`);
  }
});
