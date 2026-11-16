import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ILLUSTRATION_TAG_MAX, ILLUSTRATION_TAG_MIN, ILLUSTRATION_TAGS_MAX } from '../../config/limits.js';
import { canPublishIllustration, canWithdrawIllustration, type PermissionSubject } from '../../modules/auth/permissions.js';
import { parseTags, tagsProblem } from '../../modules/illustrations/illustrations.rules.js';

// Ilustraciones de la comunidad (RN-22; contrato del bloque 6): reglas puras de etiquetas y permisos.

const subject = (overrides: Partial<PermissionSubject> = {}): PermissionSubject => ({
  id: 1,
  role: 'user',
  isAuthor: false,
  status: 'active',
  tokenVersion: 0,
  premiumUntil: null,
  ...overrides,
});

test('RN-22: las etiquetas se separan por comas y se normalizan con la regla del slug (minúsculas, sin acentos, guiones)', () => {
  assert.deepEqual(parseTags('Fan Art, ÑANDÚ épico,  boceto  '), ['fan-art', 'nandu-epico', 'boceto']);
  assert.deepEqual(parseTags('#tinta!!, --lápiz--, a_b'), ['tinta', 'lapiz', 'a-b']);
});

test('RN-22: las etiquetas vacías y las repetidas tras normalizar se descartan; sin texto, ninguna', () => {
  assert.deepEqual(parseTags(''), []);
  assert.deepEqual(parseTags(' , ,, !!! ,'), []);
  assert.deepEqual(parseTags('Tinta, tinta, TINTA , tínta, lápiz'), ['tinta', 'lapiz']);
});

test('RN-22: de 0 a 5 etiquetas, de 2 a 30 caracteres cada una', () => {
  assert.equal(ILLUSTRATION_TAGS_MAX, 5);
  assert.equal(ILLUSTRATION_TAG_MIN, 2);
  assert.equal(ILLUSTRATION_TAG_MAX, 30);
  assert.equal(tagsProblem([]), null);
  assert.equal(tagsProblem(['ab', 'a'.repeat(30), 'tres', 'cuatro', 'cinco']), null);
  assert.equal(tagsProblem(['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis']), 'Puedes poner como mucho 5 etiquetas');
  assert.equal(tagsProblem(['a']), 'Cada etiqueta debe tener entre 2 y 30 caracteres');
  assert.equal(tagsProblem(['a'.repeat(31)]), 'Cada etiqueta debe tener entre 2 y 30 caracteres');
});

test('RN-22: publica cualquier cuenta registrada (lector, premium o autor), salvo el admin', () => {
  assert.equal(canPublishIllustration(subject()), true);
  assert.equal(canPublishIllustration(subject({ isAuthor: true })), true);
  assert.equal(canPublishIllustration(subject({ premiumUntil: new Date('2999-01-01T00:00:00Z') })), true);
  assert.equal(canPublishIllustration(subject({ role: 'admin' })), false);
});

test('RN-22: retira una ilustración su dueño o el admin; otro usuario, no', () => {
  assert.equal(canWithdrawIllustration(subject({ id: 7 }), { userId: 7 }), true);
  assert.equal(canWithdrawIllustration(subject({ id: 8 }), { userId: 7 }), false);
  assert.equal(canWithdrawIllustration(subject({ id: 8, isAuthor: true }), { userId: 7 }), false);
  assert.equal(canWithdrawIllustration(subject({ id: 9, role: 'admin' }), { userId: 7 }), true);
});
