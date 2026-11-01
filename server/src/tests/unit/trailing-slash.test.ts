import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withoutTrailingSlash } from '../../middlewares/trailing-slash.js';

test('Seguridad: la barra final se quita de las rutas locales', () => {
  assert.equal(withoutTrailingSlash('/obra/pimienta/'), '/obra/pimienta');
  assert.equal(withoutTrailingSlash('/leer/pimienta/3///'), '/leer/pimienta/3');
});

test('Seguridad: sin barra final, o en la raíz, no hay redirección', () => {
  assert.equal(withoutTrailingSlash('/'), null);
  assert.equal(withoutTrailingSlash('/obra/pimienta'), null);
});

test('Seguridad: quitar la barra nunca produce una redirección a otro sitio', () => {
  for (const path of ['//evil.com/', '///evil.com/', '/\\evil.com/', '//', '///']) {
    assert.equal(withoutTrailingSlash(path), null, path);
  }
});
