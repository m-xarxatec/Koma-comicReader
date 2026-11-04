import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLUG_MAX_LENGTH } from '../../config/limits.js';
import { SLUG_PATTERN } from '../../modules/comics/comics.schema.js';
import { LICENSE_CODES, LICENSES, licenseCodeFromName, nextFreeSlug, slugify } from '../../modules/comics/comics.rules.js';

test('RN-09: el slug sale del título en minúsculas, sin acentos y con guiones', () => {
  assert.equal(slugify('Pimienta y Zanahoria'), 'pimienta-y-zanahoria');
  assert.equal(slugify('  El Niño de la Cigüeña  '), 'el-nino-de-la-ciguena');
  assert.equal(slugify('¡¿Qué pasó?! — Capítulo 2.0'), 'que-paso-capitulo-2-0');
  assert.equal(slugify('ÀÉÎÕÜ ç'), 'aeiou-c');
});

test('RN-09: un título sin letras latinas ni números da el slug «obra»', () => {
  assert.equal(slugify('¡¡¡!!!'), 'obra');
  assert.equal(slugify('漫画'), 'obra');
  assert.equal(slugify(''), 'obra');
});

test('RN-09: el slug tiene como mucho 80 caracteres y nunca termina en guion', () => {
  const slug = slugify(`${'a'.repeat(79)} bcd`);
  assert.equal(slug, 'a'.repeat(79));
  assert.ok(slugify('x'.repeat(200)).length === SLUG_MAX_LENGTH);
  for (const title of ['Hola mundo', `${'a'.repeat(79)} bcd`, '¡Ñ!', 'a--b', '漫画']) {
    assert.match(slugify(title), SLUG_PATTERN, title); // cumple el CHECK de comics.slug
  }
});

test('RN-09: si el slug existe (también retirado), se añade -2, -3…', () => {
  assert.equal(nextFreeSlug('mi-obra', new Set()), 'mi-obra');
  assert.equal(nextFreeSlug('mi-obra', new Set(['mi-obra'])), 'mi-obra-2');
  assert.equal(nextFreeSlug('mi-obra', new Set(['mi-obra', 'mi-obra-2', 'mi-obra-3'])), 'mi-obra-4');
  assert.equal(nextFreeSlug('mi-obra', new Set(['mi-obra', 'mi-obra-3'])), 'mi-obra-2'); // el primer hueco
  assert.equal(nextFreeSlug('mi-obra', new Set(['mi-obra-2'])), 'mi-obra'); // la base libre gana
});

test('RN-07: licencias de lista cerrada, sin NC, con la URL puesta por el servidor', () => {
  assert.deepEqual(LICENSE_CODES, ['all-rights-reserved', 'cc-by-4.0', 'cc-by-sa-4.0', 'cc0-1.0']);
  for (const code of LICENSE_CODES) {
    const { name, url } = LICENSES[code];
    assert.doesNotMatch(name, /NC/);
    if (url !== null) assert.match(url, /^https:\/\/creativecommons\.org\/.+\/deed\.es$/);
    assert.equal(licenseCodeFromName(name), code);
  }
  assert.equal(LICENSES['all-rights-reserved'].url, null);
  assert.equal(licenseCodeFromName('CC BY-NC 4.0'), null); // fuera de la lista (p. ej. una importada)
});
