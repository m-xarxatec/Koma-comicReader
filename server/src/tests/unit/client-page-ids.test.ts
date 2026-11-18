import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';

// Ids de las plantillas HTML (18-nov): en author.html, el <h3> «Datos de la obra» y el campo «Título de la obra»
// compartían id="edit-title". getElementById devolvía el <h3>, así que el título no se rellenaba al editar una obra,
// y el <label for> no nombraba al campo. Se leen los archivos como texto, sin navegador.

const templates = ['pages', 'errors'].flatMap((dir) =>
  readdirSync(path.join(paths.publicDir, dir))
    .filter((name) => name.endsWith('.html'))
    .map((name) => ({ name: `${dir}/${name}`, html: readFileSync(path.join(paths.publicDir, dir, name), 'utf8') })),
);

// Sin comentarios: un id que solo aparece en un comentario no está en el DOM.
const withoutComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

// Los ids escritos tal cual (los que rellena el servidor con {{…}} no se pueden comprobar aquí).
const ids = (html: string) =>
  [...withoutComments(html).matchAll(/\sid="([^"{]+)"/g)].map((match) => match[1]).filter((id): id is string => id !== undefined);

test('Seguridad: en cada plantilla HTML, cada id aparece una sola vez (getElementById y los <label for> encuentran el suyo)', () => {
  const repeated = templates.flatMap(({ name, html }) => {
    const all = ids(html);
    return [...new Set(all.filter((id, index) => all.indexOf(id) !== index))].map((id) => `${name}: #${id}`);
  });
  assert.deepEqual(repeated, []);
});

test('Seguridad: en cada plantilla HTML, cada <label for> apunta a un campo (input, select o textarea) de la misma página', () => {
  const wrong = templates.flatMap(({ name, html }) => {
    const clean = withoutComments(html);
    return [...clean.matchAll(/<label\b[^>]*\sfor="([^"{]+)"/g)]
      .map((match) => match[1] ?? '')
      .filter((target) => !new RegExp(`<(input|select|textarea)\\b[^>]*\\sid="${target}"`).test(clean))
      .map((target) => `${name}: for="${target}"`);
  });
  assert.deepEqual(wrong, []);
});
