import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';

// Integración de E3 (Codex, 18-nov): el estudio pliega bloques en <details>. Revisión del agente frontend:
// - en «Nueva obra», las etiquetas (obligatorias) quedaban plegadas, y su error escondido mientras otro campo
//   tuviera el suyo;
// - el observador de errores también saltaba al limpiar un error (bindForm quita aria-invalid en cada `input`) y
//   llevaba el foco al siguiente campo inválido plegado mientras se escribía;
// - Escape plegaba cualquier desplegable con el foco dentro, también los formularios;
// - el menú dejaba un tabindex="-1" para siempre en la sección de destino.
// Se leen la plantilla y el JS compilado como texto, sin navegador.

const html = readFileSync(path.join(paths.publicDir, 'pages', 'author.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const author = readFileSync(path.join(paths.clientDistDir, 'pages', 'author.js'), 'utf8');

// Los <details> del estudio no se anidan: basta con el tramo de cada uno.
const folds = [...html.matchAll(/<details\b[\s\S]*?<\/details>/g)].map((match) => match[0]);

function block(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `falta ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `falta el final de ${start}`);
  return source.slice(from, to);
}

test('Seguridad: en «Nueva obra», las etiquetas (obligatorias) no van dentro de un desplegable', () => {
  assert.ok(html.includes('id="comic-tags-choices"'));
  assert.deepEqual(folds.filter((fold) => fold.includes('id="comic-tags-choices"')), []);
});

test('Seguridad: el observador de errores de /autor solo reacciona cuando un campo pasa a inválido y abre todos los desplegables con error', () => {
  const observer = block(author, 'new MutationObserver(', '.observe(');
  assert.match(observer, /getAttribute\('aria-invalid'\) === 'true'/, 'al quitar aria-invalid (escribir) no hace nada');
  assert.match(observer, /querySelectorAll\('\[aria-invalid="true"\]'\)/, 'todos los campos con error, no solo el primero');
});

test('Seguridad: Escape en /autor solo pliega los menús (el «⋯» y el carril), no los formularios', () => {
  const escape = block(author, "event.key !== 'Escape'", '\n});');
  assert.doesNotMatch(escape, /closest\('details\[open\]'\)/, 'no vale cualquier desplegable');
  assert.match(escape, /\.work-tile__options\[open\]/);
  assert.match(escape, /\.studio-rail__sections\[open\]/);
});

test('Seguridad: el tabindex que pone el menú en la sección de destino se quita al salir de ella', () => {
  const click = block(author, "studioView.addEventListener('click'", '\n});');
  assert.match(click, /hasAttribute\('tabindex'\)/, 'no pisa un tabindex que ya tuviera');
  assert.match(click, /removeAttribute\('tabindex'\)[\s\S]*once: true/, 'y lo quita al perder el foco');
});
