import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';

// Integración del diseño de /comunidad (Codex, 18-nov): «Entra para compartir» y el aviso del admin quedaban dentro
// del desplegable cerrado «Opciones de publicación». Un visitante, con JS o sin él, no veía la acción principal.
// Solo se pliega el formulario; sin él (visitante o admin), el desplegable no se muestra.

const html = readFileSync(path.join(paths.publicDir, 'pages', 'community.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const css = readFileSync(path.join(paths.publicDir, 'styles', 'components', 'community-page.css'), 'utf8');
const folds = [...html.matchAll(/<details\b[\s\S]*?<\/details>/g)].map((match) => match[0]);

test('Seguridad: en /comunidad, la invitación a entrar y el aviso del admin quedan fuera de los desplegables', () => {
  for (const marker of ['data-share-guest', 'data-share-admin']) {
    assert.ok(html.includes(marker), `falta ${marker}`);
    assert.deepEqual(folds.filter((fold) => fold.includes(marker)), [], `${marker} dentro de un <details>`);
  }
  assert.equal(folds.filter((fold) => fold.includes('data-share-form')).length, 1, 'el formulario sí va plegado');
});

test('Seguridad: el desplegable del formulario de /comunidad no se ve mientras el formulario está oculto', () => {
  assert.match(html, /<details class="community__fold community__fold--share">/);
  assert.match(css, /\.community__fold--share:has\(\.panel-card__form\[hidden\]\)\s*\{\s*display: none;/);
});
