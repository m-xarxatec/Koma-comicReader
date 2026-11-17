import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as limits from '../../config/limits.js';
import { paths } from '../../config/paths.js';

// Correcciones del estudio del autor (/autor) tras la revisión del agente frontend de la página completa (17-nov).
// La lógica que decide va en client/src/utils/author.ts (funciones puras); se carga su JS compilado (client/dist).

interface StudioView {
  creating: boolean;
  slug: string | null;
  showChapter: boolean;
}
interface ClientAuthor {
  isNewRoute: (routed: string | null, search: string) => boolean;
  viewHeading: (view: StudioView) => string;
  oneAtATime: <A extends unknown[]>(task: (...args: A) => Promise<void>) => (...args: A) => Promise<void>;
  withFieldDetails: (message: string, fields?: Readonly<Record<string, string>>) => string;
}
const load = () => import(pathToFileURL(path.join(paths.clientDistDir, 'utils', 'author.js')).href) as Promise<ClientAuthor>;
const read = (...parts: string[]) => readFileSync(path.join(...parts), 'utf8');

test('Seguridad: (D18) un enlace a una sección del estudio no vuelve a pintar la vista: solo hay ruta nueva si cambia la consulta', async () => {
  const { isNewRoute } = await load();
  assert.equal(isNewRoute(null, ''), true, 'el arranque siempre pinta');
  assert.equal(isNewRoute('?obra=mi-obra&capitulo=2', '?obra=mi-obra&capitulo=2'), false, '#resumen, #mis-obras, #nuevo-capitulo…');
  assert.equal(isNewRoute('', ''), false, 'el estudio sin obra abierta, con un ancla');
  assert.equal(isNewRoute('?obra=mi-obra&capitulo=2', '?obra=mi-obra'), true, 'Atrás desde el editor');
  assert.equal(isNewRoute('?obra=mi-obra', '?vista=nueva-obra'), true, 'a la vista de nueva obra');
});

test('Seguridad: (D18) al volver con Atrás o Adelante, el foco va al título de la vista visible', async () => {
  const { viewHeading } = await load();
  assert.equal(viewHeading({ creating: true, slug: null, showChapter: false }), 'crear-obra-title');
  assert.equal(viewHeading({ creating: false, slug: 'mi-obra', showChapter: true }), 'capitulo-title');
  assert.equal(viewHeading({ creating: false, slug: 'mi-obra', showChapter: false }), 'obra-title');
  assert.equal(viewHeading({ creating: false, slug: null, showChapter: false }), 'mis-obras-title');
});

// Con timeout: si el segundo clic no se ignora, espera para siempre a una promesa que nadie resuelve.
test('Seguridad: retirar un capítulo no se lanza dos veces a la vez: un segundo clic mientras dura el primero no hace nada', { timeout: 2000 }, async () => {
  const { oneAtATime } = await load();
  let runs = 0;
  let finish: () => void = () => {};
  const withdraw = oneAtATime(async (_number: number) => {
    runs += 1;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const first = withdraw(3);
  await withdraw(3); // mientras el primero espera: se ignora
  assert.equal(runs, 1);
  finish();
  await first;
  const again = withdraw(3); // terminado el primero, vuelve a poder lanzarse
  assert.equal(runs, 2);
  finish();
  await again;
});

test('RN-10: el aviso de una subida rechazada con 400 dice qué falla, no solo «Revisa los datos enviados»', async () => {
  const { withFieldDetails } = await load();
  assert.equal(withFieldDetails('Revisa los datos enviados.', { image: 'Falta la imagen' }), 'Revisa los datos enviados. Falta la imagen');
  assert.equal(withFieldDetails('Revisa los datos enviados.', { a: 'Uno.', b: 'Dos.' }), 'Revisa los datos enviados. Uno. Dos.');
  assert.equal(withFieldDetails('No se pudo subir.'), 'No se pudo subir.', 'sin campos, igual');
  assert.equal(withFieldDetails('No se pudo subir.', {}), 'No se pudo subir.');
});

test('Seguridad: el estudio usa esas reglas y sus aria-label contienen el texto visible (el control por voz los encuentra)', () => {
  const author = read(paths.clientDistDir, 'pages', 'author.js');
  assert.ok(author.includes(`from '../utils/author.js'`), 'importa utils/author.js');
  assert.ok(author.includes('`Ver ficha de ${'), '«Ver ficha»');
  assert.ok(author.includes('`Ver motivo del rechazo de ${'), '«Ver motivo»');
  assert.ok(!author.includes('Ver la ficha de') && !author.includes('Ver el motivo del rechazo de'), 'sin las etiquetas antiguas');
});

test('RN-09: los límites escritos en author.html (la página se entiende sin JS) coinciden con los del servidor', () => {
  const html = read(paths.publicDir, 'pages', 'author.html');
  const hint = (id: string) => new RegExp(`id="${id}">([^<]*)</`).exec(html)?.[1] ?? '';
  const mb = limits.MAX_IMAGE_BYTES / (1024 * 1024);
  assert.equal(hint('obra-cover-hint'), `JPEG, PNG o WebP, hasta ${mb} MB.`);
  assert.equal(hint('comic-cover-hint'), `JPEG, PNG o WebP, hasta ${mb} MB. Se sube al crear la obra.`);
  assert.equal(hint('editor-images-hint'), `JPEG, PNG o WebP, hasta ${mb} MB cada una y ${limits.MAX_PANELS_PER_CHAPTER} por capítulo.`);
  for (const id of ['edit-synopsis-hint', 'comic-synopsis-hint']) assert.equal(hint(id), `Hasta ${limits.COMIC_SYNOPSIS_MAX} caracteres.`, id);
  for (const id of ['edit-tags-hint', 'comic-tags-hint']) assert.equal(hint(id), `De 1 a ${limits.COMIC_TAGS_MAX}, con al menos un género.`, id);
  assert.equal(hint('comic-content-warning-hint'), `Se mostrará antes del primer capítulo. Hasta ${limits.CONTENT_WARNING_MAX} caracteres.`);
  assert.equal(hint('edit-content-warning-hint'), `Se mostrará antes del primer capítulo. Hasta ${limits.CONTENT_WARNING_MAX} caracteres.`, 'la de edición, como la de alta');
});
