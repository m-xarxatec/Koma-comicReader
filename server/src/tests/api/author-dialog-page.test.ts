import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';

// D2 del pulido (docs/plan_mvp.md, «Pulido»): el estudio del autor (/autor) confirma en un <dialog> y avisa de los
// resultados en un único aviso flotante al final de main, como /admin, en lugar de confirm() y de las regiones de
// estado de cada sección. Los mensajes de carga o de lista vacía y los errores de los formularios no cambian.
const srv = startTestServer();

async function authorCookie(): Promise<string> {
  const { pool } = await import('../../db/pool.js');
  const { signSession } = await import('../../modules/auth/auth.service.js');
  const { rows } = await pool.query<{ id: number; token_version: number }>(
    `INSERT INTO users (email, password_hash, display_name, role, is_author)
     VALUES ($1, 'sin-uso', 'Autora del diálogo', 'user', true) RETURNING id, token_version`,
    [`autor-${crypto.randomUUID()}@dialogo.test`],
  );
  const user = rows[0]!;
  return `koma_session=${signSession({ id: user.id, tokenVersion: user.token_version })}`;
}

const studio = async () => {
  const res = await fetch(`${srv.baseUrl}/autor`, { headers: { cookie: await authorCookie() }, redirect: 'manual' });
  assert.equal(res.status, 200);
  return res.text();
};

test('Seguridad: (D2) /autor trae un solo <dialog> de confirmación, modal con method="dialog", título, texto, Cancelar y Confirmar', async () => {
  const html = await studio();
  assert.equal(html.split('<dialog').length - 1, 1, 'un solo diálogo');
  assert.match(html, /<dialog class="confirm-dialog" id="confirm-dialog" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-text">/);
  const dialog = html.slice(html.indexOf('<dialog'), html.indexOf('</dialog>'));
  assert.match(dialog, /<form class="[^"]*" method="dialog">/, 'no envía nada al servidor');
  assert.match(dialog, /<h2 class="[^"]*" id="confirm-dialog-title"><\/h2>/);
  assert.match(dialog, /<p class="[^"]*" id="confirm-dialog-text"><\/p>/);
  assert.match(dialog, /<button class="[^"]*" type="button" data-confirm-dialog-cancel>Cancelar<\/button>/);
  assert.match(dialog, /<button class="[^"]*" type="submit" value="confirm" data-confirm-dialog-confirm>Confirmar<\/button>/);
  assert.ok(!dialog.includes('data-needs-js'), 'el botón del diálogo no cuenta entre los que esperan al JS');
});

test('Seguridad: (D2) /autor avisa en un único aviso flotante al final de main, sin las cuatro regiones de estado por sección', async () => {
  const html = await studio();
  assert.match(html, /<p class="floating-notice" role="status" aria-live="polite" data-notice><\/p>\s*<\/main>/);
  assert.equal(html.split('data-notice').length - 1, 1, 'un solo aviso');
  for (const id of ['obra-feedback', 'edit-status', 'editor-status', 'works-status']) {
    assert.ok(!html.includes(`id="${id}"`), `sin #${id}`);
  }
  assert.ok(html.includes('<link rel="stylesheet" href="/styles/components/confirm-dialog.css">'), 'estilos del diálogo');
  assert.ok(html.includes('<link rel="stylesheet" href="/styles/components/floating-notice.css">'), 'estilos del aviso flotante');
  // Se mantienen: el mensaje de carga del panel y los errores de los formularios.
  assert.ok(html.includes('id="summary-message" role="status"'), 'mensaje de carga del panel');
  assert.equal(html.split('data-form-error role="alert"').length - 1, 3, 'errores de los tres formularios');
});
