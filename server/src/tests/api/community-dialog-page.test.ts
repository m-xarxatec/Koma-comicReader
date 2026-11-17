import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';

// /comunidad tras la revisión del bloque 6 (17-nov): la retirada se confirma con el diálogo común del componente
// (D2) y, al volver a pintar «Mis ilustraciones», el foco va a su título.
const srv = startTestServer();
const count = (html: string, text: string) => html.split(text).length - 1;

test('Seguridad: /comunidad confirma la retirada con el diálogo común (#confirm-dialog), sin el propio, y sigue con dos diálogos', async () => {
  const html = await (await fetch(`${srv.baseUrl}/comunidad`)).text();
  assert.equal(count(html, '<dialog'), 2, 'detalle y confirmación');
  assert.match(html, /<dialog class="confirm-dialog" id="confirm-dialog" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-text">/);
  assert.equal(count(html, 'data-confirm-dialog-confirm'), 1);
  assert.equal(count(html, 'data-confirm-dialog-cancel'), 1);
  assert.equal(count(html, 'withdraw-dialog'), 0, 'sin el diálogo propio');
  assert.equal(count(html, 'community-dialog'), 0, 'sin sus clases');
  assert.ok(html.includes('<link rel="stylesheet" href="/styles/components/confirm-dialog.css">'), 'estilos del diálogo común');
});

test('Seguridad: el título de «Mis ilustraciones» puede recibir el foco al retirar o cambiar de página', async () => {
  const html = await (await fetch(`${srv.baseUrl}/comunidad`)).text();
  assert.ok(html.includes('<h2 class="community__heading" id="mine-title" tabindex="-1">Mis ilustraciones</h2>'));
});
