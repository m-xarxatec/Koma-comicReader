import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeLike } from '../../modules/comics/comics.repository.js';
import { catalogQuery } from '../../modules/comics/comics.schema.js';

// Catálogo (CU-01): escape de ILIKE y validación de la query de GET /api/comics. Sin BD ni entorno:
// comics.repository.ts solo importa tipos de db/pool.ts.

test('Seguridad: escapeLike convierte %, _ y \\ en texto literal para ILIKE', () => {
  assert.equal(escapeLike('50% off'), '50\\% off');
  assert.equal(escapeLike('a_b'), 'a\\_b');
  assert.equal(escapeLike('c\\d'), 'c\\\\d');
  assert.equal(escapeLike('%_\\'), '\\%\\_\\\\');
  assert.equal(escapeLike("O'Brien -- ;"), "O'Brien -- ;"); // las comillas no se tocan: van como parámetro
});

test('Seguridad: la query del catálogo tiene valores por defecto y recorta la búsqueda', () => {
  assert.deepEqual(catalogQuery.parse({}), { q: '', tags: [], page: 1 });
  assert.deepEqual(catalogQuery.parse({ q: '  princesas  ', tags: '', page: '2' }), { q: 'princesas', tags: [], page: 2 });
});

test('Seguridad: la búsqueda admite 100 caracteres y rechaza 101', () => {
  assert.equal(catalogQuery.safeParse({ q: 'a'.repeat(100) }).success, true);
  assert.equal(catalogQuery.safeParse({ q: 'a'.repeat(101) }).success, false);
  assert.equal(catalogQuery.safeParse({ q: ` ${'a'.repeat(100)} ` }).success, true, 'cuenta después de recortar');
});

test('Seguridad: las etiquetas son slugs separados por comas, sin repetidos y como mucho 10', () => {
  const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);
  assert.deepEqual(catalogQuery.parse({ tags: 'fantasia,magia,fantasia' }).tags, ['fantasia', 'magia']);
  assert.deepEqual(catalogQuery.parse({ tags: ten.join(',') }).tags, ten);
  assert.deepEqual(catalogQuery.parse({ tags: [...ten, 't0'].join(',') }).tags, ten, 'un repetido no cuenta para el límite');
  for (const tags of [[...ten, 't10'].join(','), 'Fantasía', 'fantasia,,magia', 'fantasia, magia', 'a_b', '--']) {
    assert.equal(catalogQuery.safeParse({ tags }).success, false, tags);
  }
});

test('Seguridad: la página es un entero desde 1, y un parámetro repetido es un error', () => {
  for (const page of ['0', '-1', '1.5', 'abc', '']) assert.equal(catalogQuery.safeParse({ page }).success, false, page);
  for (const query of [{ q: ['a', 'b'] }, { tags: ['a', 'b'] }, { page: ['1', '2'] }]) {
    assert.equal(catalogQuery.safeParse(query).success, false, JSON.stringify(query));
  }
});
