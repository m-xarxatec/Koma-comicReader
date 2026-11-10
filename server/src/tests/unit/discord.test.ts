import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';
import { COMMUNITY_MARKER, FOOTER_MARKER, HEAD_MARKER, HEADER_MARKER, renderTemplate } from '../../utils/layout.js';

// Enlace de Discord (idea 10; contrato del bloque 5, D12 y D13): validación de DISCORD_INVITE_URL en env.ts y
// las dos situaciones del layout (con URL y sin ella).
const INVITE = 'https://discord.gg/abcDEF123';
const count = (html: string, text: string) => html.split(text).length - 1;
const page = `<head>${HEAD_MARKER}</head><body>${HEADER_MARKER}<main>${COMMUNITY_MARKER}</main>${FOOTER_MARKER}</body>`;
const NEW_TAB = 'target="_blank" rel="noopener noreferrer"';
const NOTE = '<span class="visually-hidden"> (se abre en otra pestaña)</span>';

// env.ts termina el proceso si una variable no es válida: se carga en un proceso aparte con un entorno mínimo
// completo (sin .env) y se lee lo que queda en env.DISCORD_INVITE_URL.
const ENV_MODULE = pathToFileURL(path.join(import.meta.dirname, '..', '..', 'config', 'env.js')).href;
const BASE_ENV = {
  NODE_ENV: 'development',
  PORT: '3000',
  HOST: '127.0.0.1',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://koma:koma@localhost:5432/koma',
  JWT_SECRET: 'j'.repeat(32),
  COOKIE_SECRET: 'c'.repeat(32),
  COOKIE_SECURE: 'false',
  TRUST_PROXY: '0',
  AD_MIN_SECONDS: '5',
  SIGNED_URL_TTL_SECONDS: '7200',
  LOG_LEVEL: 'error',
  CONTENT_DIR: './content',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: './storage',
  PAYMENTS_DRIVER: 'fake',
};

function loadDiscord(value: string | undefined): { status: number | null; stdout: string; stderr: string } {
  const env: Record<string, string> = { ...BASE_ENV, PATH: process.env['PATH'] ?? '' };
  if (value !== undefined) env['DISCORD_INVITE_URL'] = value;
  const script = `const { env } = await import(${JSON.stringify(ENV_MODULE)}); console.log(JSON.stringify(env.DISCORD_INVITE_URL ?? null));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
}

test('Seguridad: DISCORD_INVITE_URL acepta invitaciones https de discord.gg y discord.com; vacía o ausente = sin enlace', () => {
  for (const [value, expected] of [
    [INVITE, INVITE],
    ['https://discord.com/invite/abcDEF123', 'https://discord.com/invite/abcDEF123'],
    ['', null],
    [undefined, null],
  ] as const) {
    const result = loadDiscord(value);
    assert.equal(result.status, 0, `${String(value)}: ${result.stderr}`);
    assert.equal(result.stdout, JSON.stringify(expected), String(value));
  }
});

test('Seguridad: un DISCORD_INVITE_URL no válido impide arrancar (http, otro host, subdominio falso o texto)', () => {
  for (const value of ['http://discord.gg/abc', 'https://evil.example/abc', 'https://discord.gg.evil.example/abc', 'https://www.discord.com/invite/abc', 'javascript:alert(1)', 'discord.gg/abc']) {
    const result = loadDiscord(value);
    assert.equal(result.status, 1, value);
    assert.match(result.stderr, /DISCORD_INVITE_URL/, value);
  }
});

test('Seguridad: sin URL, el pie no muestra el enlace y «Comunidad» sigue en «Próximamente»', () => {
  for (const html of [renderTemplate(page, {}, '/'), renderTemplate(page, {}, '/', null)]) {
    assert.equal(count(html, 'discord'), 0);
    assert.equal(count(html, 'Únete a nuestro Discord'), 0);
    assert.equal(count(html, 'target="_blank"'), 0);
    assert.equal(count(html, '<span class="quick-link quick-link--soon">'), 1);
    assert.equal(count(html, '<strong>Comunidad</strong>'), 1);
    assert.equal(count(html, 'Próximamente'), 1);
    assert.equal(count(html, '<!-- @'), 0, 'sin marcadores');
  }
});

test('Seguridad: con URL, el pie y «Comunidad» enlazan a la invitación en otra pestaña, con noopener noreferrer y el aviso oculto', () => {
  const html = renderTemplate(page, {}, '/', INVITE);
  assert.equal(count(html, `<a class="site-footer__link" href="${INVITE}" ${NEW_TAB}>Únete a nuestro Discord${NOTE}</a>`), 1, 'pie');
  assert.equal(count(html, `<a class="quick-link" href="${INVITE}" ${NEW_TAB}>`), 1, 'Comunidad');
  assert.equal(count(html, NOTE), 2);
  assert.equal(count(html, 'Próximamente'), 0);
  assert.equal(count(html, 'quick-link--soon'), 0);
  assert.equal(count(html, '<!-- @'), 0, 'sin marcadores');
});

test('Seguridad: la URL de Discord sale escapada en el atributo href', () => {
  const html = renderTemplate(page, {}, '/', `${INVITE}?a="><script>&b='x'`);
  assert.ok(!html.includes('"><script>'), 'sin inyección');
  assert.equal(count(html, `href="${INVITE}?a=&quot;&gt;&lt;script&gt;&amp;b=&#39;x&#39;"`), 2);
});

test('Seguridad: solo home.html lleva el marcador de «Comunidad», una vez; ninguna otra plantilla', async () => {
  for (const dir of ['pages', 'errors']) {
    for (const name of (await readdir(path.join(paths.publicDir, dir))).filter((file) => file.endsWith('.html'))) {
      const html = await readFile(path.join(paths.publicDir, dir, name), 'utf8');
      assert.equal(count(html, COMMUNITY_MARKER), dir === 'pages' && name === 'home.html' ? 1 : 0, `${dir}/${name}`);
      assert.equal(count(html, '<strong>Comunidad</strong>'), 0, `${dir}/${name}: el acceso rápido «Comunidad» solo sale de layout.ts`);
    }
  }
});
