import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeText, textField, textProblem } from '../../utils/text.js';

test('Seguridad: los textos se recortan y, en los de varias líneas, \\r\\n pasa a \\n', () => {
  assert.equal(normalizeText('  hola  '), 'hola');
  assert.equal(normalizeText(' a\r\nb\rc \n', true), 'a\nb\nc');
  assert.equal(normalizeText('a\r\nb'), 'a\r\nb'); // una línea: no se toca (después lo rechaza textProblem)
});

test('RN-11: la longitud se cuenta en puntos de código, no en unidades UTF-16', () => {
  const rule = { min: 1, max: 500, multiline: true };
  assert.equal(textProblem('😀'.repeat(500), rule), null); // 1000 unidades UTF-16, 500 caracteres
  assert.equal(textProblem('😀'.repeat(501), rule), 'No puede pasar de 500 caracteres');
  assert.equal(textProblem('', rule), 'Este campo es obligatorio');
  assert.equal(textProblem('ab', { min: 3, max: 30 }), 'Debe tener al menos 3 caracteres');
});

test('Seguridad: sin caracteres de control; el salto de línea solo en los textos de varias líneas', () => {
  assert.equal(textProblem('a\nb', { min: 1, max: 10, multiline: true }), null);
  assert.equal(textProblem('a\nb', { min: 1, max: 10 }), 'Contiene caracteres no válidos');
  for (const bad of ['a\u0000b', 'a\tb', 'a\u001bb', 'a\u007fb']) {
    assert.equal(textProblem(bad, { min: 1, max: 10, multiline: true }), 'Contiene caracteres no válidos', JSON.stringify(bad));
  }
});

test('Seguridad: textField devuelve el texto normalizado o los mensajes de la regla', () => {
  const field = textField({ min: 1, max: 5, multiline: true });
  assert.equal(field.parse('  a\r\nb  '), 'a\nb');
  assert.equal(field.safeParse('   ').success, false);
  assert.equal(field.safeParse(42).success, false);
  assert.equal(field.safeParse('123456').error?.issues[0]?.message, 'No puede pasar de 5 caracteres');
});
