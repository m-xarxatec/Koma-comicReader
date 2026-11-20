import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';

// Visor de /tutoriales (E4 de Codex, 712e119; revisión de frontend y auditor, 20-nov). El popover no era modal: con
// Tab se salía a la página de detrás con el vídeo sonando. Pasa a <dialog> con showModal(), como el panel de
// comentarios. Las direcciones del reproductor con autoplay y de la portada salen de utils/tutorials.ts, validadas.

interface ClientTutorials {
  autoplayEmbedUrl: (id: string) => string | null;
  coverUrl: (id: string) => string | null;
  coverLoading: (index: number) => 'eager' | 'lazy';
}

const load = <T>(file: string) => import(pathToFileURL(path.join(paths.clientDistDir, file)).href) as Promise<T>;
const client = await load<ClientTutorials>('utils/tutorials.js');

const html = readFileSync(path.join(paths.publicDir, 'pages', 'tutorials.html'), 'utf8');
const pageTs = readFileSync(path.join(paths.root, 'client', 'src', 'pages', 'tutorials.ts'), 'utf8');
const css = readFileSync(path.join(paths.publicDir, 'styles', 'components', 'tutorials-page.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const BAD_IDS = ['', 'corto', 'XeIR7P82aPU0', 'XeIR7P82aP/', '../../admin', 'XeIR7P82aP?', 'javascript:', 'XeIR7P82aPU\n'];

test('Seguridad: (CU-42, D12) autoplayEmbedUrl monta el reproductor de youtube-nocookie.com con autoplay solo con un id válido', () => {
  assert.equal(client.autoplayEmbedUrl('XeIR7P82aPU'), 'https://www.youtube-nocookie.com/embed/XeIR7P82aPU?autoplay=1&playsinline=1');
  for (const id of BAD_IDS) assert.equal(client.autoplayEmbedUrl(id), null, JSON.stringify(id));
});

test('Seguridad: (CU-42) coverUrl monta /icons/tutorials/<id>.webp solo con un id válido, y solo la primera portada se carga sin esperar', () => {
  assert.equal(client.coverUrl('AmoW_LqwQ40'), '/icons/tutorials/AmoW_LqwQ40.webp');
  for (const id of BAD_IDS) assert.equal(client.coverUrl(id), null, JSON.stringify(id));
  assert.equal(client.coverLoading(0), 'eager');
  assert.equal(client.coverLoading(1), 'lazy');
  assert.equal(client.coverLoading(5), 'lazy');
});

test('Seguridad: (CU-42) el visor es un <dialog> modal con su título y su botón de cerrar, sin popover', () => {
  assert.ok(html.includes('<dialog class="tutorial-viewer" id="tutorial-viewer" aria-labelledby="tutorial-viewer-title">'), 'diálogo del visor');
  assert.ok(html.includes('<button class="button button--outline tutorial-viewer__close" type="button" aria-label="Cerrar tutorial" data-viewer-close>×</button>'), 'cerrar');
  assert.ok(html.includes('<h2 class="tutorial-viewer__title" id="tutorial-viewer-title"></h2>'), 'título');
  assert.ok(!html.includes('popover'), 'sin popover en el HTML');
  assert.ok(pageTs.includes('viewer.showModal()'), 'se abre como modal');
  assert.ok(!/popover|hidePopover/i.test(pageTs), 'sin popover en el TS');
});

test('Seguridad: (CU-42) al salir de la página el vídeo se para en el acto, y un arrastre que empieza dentro del visor no lo cierra', () => {
  const pagehide = pageTs.slice(pageTs.indexOf("addEventListener('pagehide'"));
  assert.ok(/^addEventListener\('pagehide', \(\) => \{[^}]*stopPlayer\(\)/.test(pagehide), 'pagehide llama a stopPlayer sin esperar a close');
  assert.ok(pageTs.includes("viewer?.addEventListener('pointerdown'"), 'recuerda dónde empezó la pulsación');
});

test('Seguridad: (CSS) el visor no hereda el tope de ancho del <dialog> del navegador', () => {
  const start = css.indexOf('.tutorial-viewer {');
  assert.match(css.slice(start, css.indexOf('}', start)), /max-width: none;/);
});

test('Seguridad: (CU-42) la página no monta a mano la URL del reproductor ni la de la portada: usa las funciones validadas', () => {
  assert.ok(pageTs.includes('autoplayEmbedUrl('), 'reproductor');
  assert.ok(pageTs.includes('coverUrl('), 'portada');
  assert.ok(pageTs.includes('coverLoading('), 'carga diferida de las portadas');
  assert.ok(!pageTs.includes('?autoplay='), 'sin la query a mano');
  assert.ok(!pageTs.includes('/icons/tutorials/'), 'sin la ruta de la portada a mano');
});

test('Seguridad: (CSS) el visor se estiliza como diálogo abierto; la forma del icono, en un token, y sin repetir la regla de movimiento reducido de button.css', () => {
  assert.ok(!css.includes(':popover-open'), 'sin :popover-open');
  assert.ok(css.includes('.tutorial-viewer[open]'), 'estado abierto del diálogo');
  assert.ok(!css.includes('polygon('), 'clip-path desde un token');
  assert.ok(css.includes('clip-path: var(--tutorials-play-shape)'), 'token del icono');
  assert.ok(!css.includes('.button:hover'), 'la regla de los botones vive en button.css');
});
