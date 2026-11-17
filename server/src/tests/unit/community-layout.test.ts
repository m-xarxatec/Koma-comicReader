import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';
import { DISCORD_CARD_MARKER, renderTemplate } from '../../utils/layout.js';

// Tarjeta «Únete a nuestro Discord» de /comunidad (contrato del bloque 6, «Páginas» y D10): solo con
// DISCORD_INVITE_URL. La pone layout.ts en el marcador de community.html.
const INVITE = 'https://discord.gg/abcDEF123';
const count = (html: string, text: string) => html.split(text).length - 1;
const page = `<main>${DISCORD_CARD_MARKER}</main>`;

test('Seguridad: (D10) sin DISCORD_INVITE_URL, /comunidad no lleva la tarjeta de Discord ni deja el marcador', () => {
  const html = renderTemplate(page, {}, '/comunidad', null);
  assert.equal(html, '<main></main>');
});

test('Seguridad: (D10) con DISCORD_INVITE_URL, la tarjeta enlaza a la invitación en otra pestaña, con noopener noreferrer y el aviso', () => {
  const html = renderTemplate(page, {}, '/comunidad', INVITE);
  assert.equal(count(html, '<!-- @'), 0);
  assert.equal(count(html, `href="${INVITE}" target="_blank" rel="noopener noreferrer"`), 1);
  assert.equal(count(html, 'Únete a nuestro Discord'), 1);
  assert.equal(count(html, '<span class="visually-hidden"> (se abre en otra pestaña)</span>'), 1);
  assert.equal(count(html, 'class="discord-card"'), 1);
});

test('Seguridad: (D10) la URL de la tarjeta se escapa al inyectarse', () => {
  const html = renderTemplate(page, {}, '/comunidad', 'https://discord.gg/a"><script>alert(1)</script>');
  assert.equal(count(html, '<script>'), 0);
  assert.ok(html.includes('href="https://discord.gg/a&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'));
});

test('Seguridad: (D10) community.html lleva el marcador de la tarjeta una sola vez', async () => {
  const template = await readFile(path.join(paths.publicDir, 'pages', 'community.html'), 'utf8');
  assert.equal(count(template, DISCORD_CARD_MARKER), 1);
});
