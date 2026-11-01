import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_NEXT, safeNext } from '../../utils/redirect.js';

test('Seguridad: next acepta rutas locales', () => {
  for (const next of ['/', '/perfil', '/leer/pimienta/3?modo=lista', '/obra/pimienta#v-4']) {
    assert.equal(safeNext(next), next, next);
  }
});

test('Seguridad: next rechaza //evil, que el navegador trata como otro sitio', () => {
  assert.equal(safeNext('//evil'), DEFAULT_NEXT);
  assert.equal(safeNext('///evil.com'), DEFAULT_NEXT);
});

test('Seguridad: next rechaza /\\evil.com, porque el navegador trata \\ como /', () => {
  assert.equal(safeNext('/\\evil.com'), DEFAULT_NEXT);
});

test('Seguridad: next rechaza URL absolutas y esquemas', () => {
  for (const next of ['https://x', 'http://evil.com/perfil', 'javascript:alert(1)', 'perfil', '']) {
    assert.equal(safeNext(next), DEFAULT_NEXT, next);
  }
});

test('Seguridad: next rechaza caracteres de control, que el navegador elimina de la URL', () => {
  for (const next of ['/\t/evil.com', '/\n/evil.com', '/perfil\r\nSet-Cookie: x=1', '/\u0000']) {
    assert.equal(safeNext(next), DEFAULT_NEXT, JSON.stringify(next));
  }
});

test('Seguridad: next ausente o que no es texto vuelve al inicio', () => {
  for (const next of [undefined, null, ['/perfil'], 42]) {
    assert.equal(safeNext(next), DEFAULT_NEXT, String(next));
  }
});
