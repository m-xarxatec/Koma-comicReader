import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';
import { createUser } from './reading-fixtures.js';

// /admin, sección «Ilustraciones» (CU-32; RN-22; contrato del bloque 6, «Páginas» y D9): el HTML que rellena
// pages/admin.ts con /api/admin/illustrations. La cola de obras y el diálogo no cambian.
const srv = startTestServer();

const get = (path: string, cookie?: string) =>
  fetch(`${srv.baseUrl}${path}`, { redirect: 'manual', ...(cookie && { headers: { Cookie: cookie } }) });
const count = (html: string, text: string) => html.split(text).length - 1;

test('Seguridad: (D9) /admin lleva la sección «Ilustraciones» con su filtro de estado, su tabla y su paginación', async () => {
  const admin = await createUser('admin');
  const res = await get('/admin', admin.cookie);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(count(html, '<section id="ilustraciones"'), 1);
  assert.equal(count(html, 'href="#ilustraciones"'), 1, 'enlace en las secciones del panel');
  const section = html.slice(html.indexOf('<section id="ilustraciones"'), html.indexOf('<section id="comentarios"'));
  assert.notEqual(section, '', 'entre la cola de aprobación y los comentarios');
  assert.equal(count(section, '<h2 '), 1);
  assert.ok(section.includes('data-filters="illustrations"'), 'filtro');
  assert.match(section, /<select [^>]*name="status"[^>]*>\s*<option value="pending" selected>Pendientes<\/option>\s*<option value="approved">Publicadas<\/option>\s*<\/select>/);
  assert.match(section, /<button [^>]*type="submit" disabled data-needs-js>Mostrar<\/button>/, 'el botón del filtro espera a JS');
  for (const hook of ['data-message="illustrations"', 'data-table="illustrations"', 'data-rows="illustrations"', 'data-pager="illustrations"', 'data-count="illustrations"']) {
    assert.equal(count(section, hook), 1, hook);
  }
  assert.equal(count(section, 'role="status"'), 1);
  assert.equal(count(section, '<img'), 0, 'las imágenes las pinta admin.ts con su URL firmada');
});

test('Seguridad: (D9) la sección no añade otro h1, otro diálogo ni otro aviso flotante, y la cola de obras sigue igual', async () => {
  const admin = await createUser('admin');
  const html = await (await get('/admin', admin.cookie)).text();
  assert.equal(count(html, '<h1'), 1);
  assert.equal(count(html, '<dialog'), 1);
  assert.equal(count(html, 'data-live'), 1);
  assert.equal(count(html, '<section id="aprobaciones"'), 1);
  assert.equal(count(html, 'data-rows="review"'), 1);
  assert.ok(html.indexOf('<section id="aprobaciones"') < html.indexOf('<section id="ilustraciones"'));
});

test('Seguridad: (D9) /admin sigue cerrada para quien no es admin', async () => {
  const reader = await createUser('reader');
  assert.equal((await get('/admin', reader.cookie)).status, 403);
  const guest = await get('/admin');
  assert.equal(guest.status, 302);
  assert.equal(guest.headers.get('location'), '/entrar?next=%2Fadmin');
});
