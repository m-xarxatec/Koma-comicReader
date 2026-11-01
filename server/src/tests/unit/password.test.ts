import assert from 'node:assert/strict';
import { test } from 'node:test';
import { passwordProblem } from '../../utils/password.js';

test('RN-12: la contraseña tiene al menos 10 caracteres', () => {
  assert.notEqual(passwordProblem('123456789'), null); // 9
  assert.equal(passwordProblem('1234567890'), null); // 10
  assert.notEqual(passwordProblem(''), null);
});

test('RN-12: el máximo son 72 bytes, no 72 caracteres', () => {
  assert.equal(passwordProblem('a'.repeat(72)), null); // 72 bytes
  assert.notEqual(passwordProblem('a'.repeat(73)), null); // 73 bytes
  assert.equal(passwordProblem('ñ'.repeat(36)), null); // 36 caracteres = 72 bytes
  assert.notEqual(passwordProblem('ñ'.repeat(37)), null); // 37 caracteres = 74 bytes
  assert.notEqual(passwordProblem('🙂'.repeat(19)), null); // 19 caracteres = 76 bytes
});

test('RN-12: el mínimo se cuenta en puntos de código Unicode, no en unidades UTF-16', () => {
  assert.equal(passwordProblem('🙂'.repeat(10)), null); // 10 caracteres, 40 bytes
  assert.notEqual(passwordProblem('🙂'.repeat(9)), null); // 9 caracteres aunque sean 18 unidades UTF-16
});
