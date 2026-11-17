import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';

// /autor tras la revisión del agente frontend de la página completa (17-nov): el foco tiene a dónde ir después de
// guardar «Datos de la obra», la advertencia de edición dice su límite y no queda un <noscript> que nunca se ve.
const srv = startTestServer();
const count = (html: string, text: string) => html.split(text).length - 1;

async function studio(): Promise<string> {
  const { pool } = await import('../../db/pool.js');
  const { signSession } = await import('../../modules/auth/auth.service.js');
  const { rows } = await pool.query<{ id: number; token_version: number }>(
    `INSERT INTO users (email, password_hash, display_name, role, is_author)
     VALUES ($1, 'sin-uso', 'Autora revisada', 'user', true) RETURNING id, token_version`,
    [`autor-${crypto.randomUUID()}@revision.test`],
  );
  const user = rows[0]!;
  const res = await fetch(`${srv.baseUrl}/autor`, { headers: { cookie: `koma_session=${signSession({ id: user.id, tokenVersion: user.token_version })}` } });
  assert.equal(res.status, 200);
  return res.text();
}

test('Seguridad: /autor tiene a dónde llevar el foco tras guardar «Datos de la obra» y un solo aviso sin JavaScript', async () => {
  const html = await studio();
  assert.ok(html.includes('<h3 class="panel-card__title" id="edit-title" tabindex="-1">Datos de la obra</h3>'), 'título enfocable');
  assert.equal(count(html, '<noscript>'), 1, 'el de la cabecera de la página; el de «Nueva obra» nunca se veía');
});

test('Seguridad: la advertencia de «Datos de la obra» dice su límite, como la de alta', async () => {
  const html = await studio();
  assert.match(html, /<input class="form__input" id="edit-content-warning" [^>]*aria-describedby="edit-content-warning-hint edit-content-warning-error">/);
  assert.equal(count(html, 'id="edit-content-warning-hint"'), 1);
});
