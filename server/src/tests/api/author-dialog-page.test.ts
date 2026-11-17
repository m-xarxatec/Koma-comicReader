import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';
import { createUser } from './reading-fixtures.js';

// Estudio del autor (pulido, D2): las confirmaciones van en un <dialog> y los avisos en una sola región flotante,
// como en /admin, en lugar de confirm() y de un mensaje por sección.
const srv = startTestServer();
const count = (html: string, text: string) => html.split(text).length - 1;

test('Seguridad: (D2) /autor lleva un diálogo de confirmación con method="dialog", «Cancelar» y un botón de envío con value="confirm"', async () => {
  const author = await createUser('author');
  const res = await fetch(`${srv.baseUrl}/autor`, { headers: { Cookie: author.cookie } });
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(count(html, '<dialog'), 1);
  const dialog = html.slice(html.indexOf('<dialog'), html.indexOf('</dialog>'));
  assert.match(dialog, /^<dialog class="author-dialog" id="author-dialog" aria-labelledby="author-dialog-title">/);
  assert.match(dialog, /<form [^>]*method="dialog"[^>]*>/, 'no envía nada al servidor');
  assert.match(dialog, /<h2 [^>]*id="author-dialog-title"[^>]*data-dialog-title[^>]*><\/h2>/);
  assert.equal(count(dialog, 'data-dialog-text'), 1);
  assert.match(dialog, /<button [^>]*type="button"[^>]*data-dialog-cancel[^>]*>Cancelar<\/button>/);
  assert.match(dialog, /<button [^>]*type="submit"[^>]*value="confirm"[^>]*data-dialog-confirm[^>]*>/);
});

test('Seguridad: (D2) /autor anuncia las acciones en una sola región flotante, al final de main, y ya no en un mensaje por sección', async () => {
  const author = await createUser('author');
  const html = await (await fetch(`${srv.baseUrl}/autor`, { headers: { Cookie: author.cookie } })).text();
  assert.equal(count(html, '<p class="author-page__feedback" role="status" aria-live="polite" data-live></p>'), 1);
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  assert.ok(main.trimEnd().endsWith('data-live></p>'), 'último hijo de main');
  for (const id of ['works-status', 'obra-feedback', 'edit-status', 'editor-status']) {
    assert.equal(count(html, `id="${id}"`), 0, `${id}: mensaje por sección retirado`);
  }
  // Los errores de cada formulario siguen junto a él (role="alert").
  assert.equal(count(html, 'data-form-error role="alert"'), 3);
});
