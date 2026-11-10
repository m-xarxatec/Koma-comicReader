import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';

// Enlace de Discord (idea 10; D12 y D13) con DISCORD_INVITE_URL definida: env.ts la lee al cargarse y cada
// archivo de test corre en su propio proceso. Sin ella, lo comprueba pages.test.ts.
const INVITE = 'https://discord.gg/kOmAtEsT';
process.env['DISCORD_INVITE_URL'] = INVITE;

const srv = startTestServer();
const count = (html: string, text: string) => html.split(text).length - 1;
const LINK = `href="${INVITE}" target="_blank" rel="noopener noreferrer"`;

test('Seguridad: con DISCORD_INVITE_URL, la portada enlaza «Comunidad» y el pie a la invitación', async () => {
  const res = await fetch(`${srv.baseUrl}/`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(count(html, LINK), 2, 'pie y «Comunidad»');
  assert.equal(count(html, 'Únete a nuestro Discord'), 1);
  assert.equal(count(html, 'Próximamente'), 1, 'solo «Tutoriales» sigue en Próximamente');
});

test('Seguridad: con DISCORD_INVITE_URL, el pie de otras páginas y de las de error lleva el enlace', async () => {
  for (const [url, status] of [
    ['/entrar', 200],
    ['/no-existe', 404],
  ] as const) {
    const res = await fetch(`${srv.baseUrl}${url}`, { redirect: 'manual' });
    const html = await res.text();
    assert.equal(res.status, status, url);
    assert.equal(count(html, `<a class="site-footer__link" ${LINK}>`), 1, url);
    assert.equal(count(html, 'class="quick-link'), 0, `${url}: «Comunidad» solo en la portada`);
  }
});
