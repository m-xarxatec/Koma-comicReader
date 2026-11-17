import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as limits from '../../config/limits.js';
import { paths } from '../../config/paths.js';
import { COMMUNITY_MARKER, renderTemplate } from '../../utils/layout.js';

// Correcciones de /comunidad tras la revisión del agente frontend y del auditor del bloque 6 (17-nov). Se carga el JS
// compilado del cliente (client/dist, lo genera `tsc -b`); el HTML se lee de client/public.

type PaginationView = { kind: 'hidden' } | { kind: 'back'; to: number } | { kind: 'full'; page: number; pages: number };
interface ClientIllustrations {
  imageProblem: (file: { size: number; type: string } | null) => string | null;
  paginationView: (page: number, pages: number) => PaginationView;
}
const load = () => import(pathToFileURL(path.join(paths.clientDistDir, 'utils', 'illustrations.js')).href) as Promise<ClientIllustrations>;
const read = (...parts: string[]) => readFileSync(path.join(...parts), 'utf8');

test('RN-10: el aviso temprano de /comunidad deja pasar una imagen sin tipo (un .webp en algunos Windows): decide el servidor por la firma', async () => {
  const { imageProblem } = await load();
  assert.equal(imageProblem({ size: 1024, type: '' }), null);
  assert.equal(imageProblem({ size: limits.MAX_IMAGE_BYTES + 1, type: '' }), 'La imagen no puede pasar de 5 MB', 'el tamaño se sigue comprobando');
  assert.equal(imageProblem({ size: 1024, type: 'image/gif' }), 'La imagen debe ser JPEG, PNG o WebP', 'un tipo conocido y no admitido, no');
});

test('RN-22: la paginación de /comunidad, fuera de rango y sin resultados, deja volver a la página 1 en lugar de un «Anterior» desactivado', async () => {
  const { paginationView } = await load();
  assert.deepEqual(paginationView(1, 0), { kind: 'hidden' }, 'sin resultados en la primera página');
  assert.deepEqual(paginationView(1, 1), { kind: 'hidden' }, 'una sola página');
  assert.deepEqual(paginationView(3, 0), { kind: 'back', to: 1 }, '?page=3 sin ninguna ilustración');
  assert.deepEqual(paginationView(5, 2), { kind: 'back', to: 2 }, 'más allá de la última página');
  assert.deepEqual(paginationView(2, 3), { kind: 'full', page: 2, pages: 3 });
  assert.deepEqual(paginationView(1, 2), { kind: 'full', page: 1, pages: 2 });
});

test('Seguridad: /comunidad confirma la retirada con el componente del diálogo (D2), sin una copia propia', () => {
  const community = read(paths.clientDistDir, 'pages', 'community.js');
  assert.ok(community.includes(`from '../components/confirm-dialog.js'`), 'importa el componente');
  assert.equal(community.match(/\bconfirmAction\(/g)?.length, 1, 'retirar una ilustración');
  assert.ok(!community.includes('withdraw-dialog'), 'sin el diálogo propio');
  const css = read(paths.publicDir, 'styles', 'components', 'community-page.css');
  assert.ok(!css.includes('.community-dialog'), 'sin el CSS duplicado del diálogo');
});

test('RN-22: los límites escritos en community.html (la página se entiende sin JS) coinciden con los del servidor', () => {
  const html = read(paths.publicDir, 'pages', 'community.html');
  const hint = (id: string) => new RegExp(`id="${id}">([^<]*)</p>`).exec(html)?.[1] ?? '';
  assert.ok(html.includes(`Puedes tener hasta ${limits.ILLUSTRATION_PENDING_MAX} pendientes de revisión.`), 'pendientes');
  assert.equal(hint('share-image-hint'), `JPEG, PNG o WebP, hasta ${limits.MAX_IMAGE_BYTES / (1024 * 1024)} MB.`);
  assert.equal(hint('share-title-hint'), `Hasta ${limits.ILLUSTRATION_TITLE_MAX} caracteres.`);
  assert.equal(hint('share-description-hint'), `Hasta ${limits.ILLUSTRATION_DESCRIPTION_MAX} caracteres.`);
  assert.ok(hint('share-tags-hint').startsWith(`Hasta ${limits.ILLUSTRATION_TAGS_MAX}, `), 'etiquetas');
});

test('Seguridad: el acceso rápido «Comunidad» de la portada no promete comentarios (recorte del CU-18): «Comparte tus ilustraciones»', () => {
  const html = renderTemplate(`<main>${COMMUNITY_MARKER}</main>`, {}, '/');
  assert.equal(html.split('Comparte tus ilustraciones').length - 1, 1);
  assert.ok(!html.includes('Comenta'), 'sin «Comenta y comparte»');
});

test('Seguridad: quick-links.css ya no guarda estilos de «Próximamente», sin uso desde D10', () => {
  const css = read(paths.publicDir, 'styles', 'components', 'quick-links.css');
  assert.ok(!css.includes('quick-link--soon'));
  assert.ok(!css.includes('quick-link__soon'));
});
