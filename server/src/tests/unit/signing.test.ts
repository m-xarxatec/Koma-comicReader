import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveKey, sign, signExpiring, verify, verifyExpiring } from '../../utils/signing.js';

const SECRET = 'x'.repeat(48);
const OTHER_SECRET = 'y'.repeat(48);

test('Seguridad: cada uso tiene su propia clave derivada de COOKIE_SECRET, estable entre arranques', () => {
  const files = deriveKey(SECRET, 'files');
  assert.equal(files.length, 32);
  assert.deepEqual(deriveKey(SECRET, 'files'), files);
  assert.notDeepEqual(deriveKey(SECRET, 'ad-token'), files);
  assert.notDeepEqual(deriveKey(SECRET, 'guest-reads'), files);
  assert.notDeepEqual(deriveKey(OTHER_SECRET, 'files'), files);
  assert.notDeepEqual(files, Buffer.from(SECRET).subarray(0, 32)); // nunca el secreto en bruto
});

test('Seguridad: una firma hecha para un uso no vale para otro', () => {
  const signature = sign(deriveKey(SECRET, 'ad-token'), '42.1700000000');
  assert.equal(verify(deriveKey(SECRET, 'ad-token'), '42.1700000000', signature), true);
  assert.equal(verify(deriveKey(SECRET, 'files'), '42.1700000000', signature), false);
  assert.equal(verify(deriveKey(SECRET, 'guest-reads'), '42.1700000000', signature), false);
});

test('Seguridad: una firma alterada, de otros datos, con basura añadida o vacía no vale', () => {
  const key = deriveKey(SECRET, 'files');
  const signature = sign(key, 'datos');
  assert.match(signature, /^[A-Za-z0-9_-]{43}$/);
  const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  for (const [name, data, candidate] of [
    ['un carácter cambiado', 'datos', flipped],
    ['otros datos', 'datos2', signature],
    ['basura al final', 'datos', `${signature}A`],
    ['con relleno =', 'datos', `${signature}=`],
    ['recortada', 'datos', signature.slice(0, -1)],
    ['vacía', 'datos', ''],
  ] as const) {
    assert.equal(verify(key, data, candidate), false, name);
  }
});

test('Seguridad: la firma con caducidad vale hasta exp; después, expired; con exp cambiado, invalid', () => {
  const key = deriveKey(SECRET, 'files');
  const exp = 1_800_000_000;
  const signature = signExpiring(key, 'clave.webp', exp);
  assert.equal(verifyExpiring(key, 'clave.webp', exp, signature, exp - 1), 'valid');
  assert.equal(verifyExpiring(key, 'clave.webp', exp, signature, exp), 'expired');
  assert.equal(verifyExpiring(key, 'clave.webp', exp, signature, exp + 3600), 'expired');
  assert.equal(verifyExpiring(key, 'clave.webp', exp + 3600, signature, exp - 1), 'invalid');
  assert.equal(verifyExpiring(key, 'otra.webp', exp, signature, exp - 1), 'invalid');
});

test('Seguridad: un exp negativo bien firmado ya está caducado; pasar un exp a negativo o enorme invalida la firma', () => {
  const key = deriveKey(SECRET, 'files');
  const now = 1_800_000_000;
  assert.equal(verifyExpiring(key, 'clave.webp', -1, signExpiring(key, 'clave.webp', -1), now), 'expired');
  const signature = signExpiring(key, 'clave.webp', now + 60);
  for (const exp of [-(now + 60), -1, 0, Number.MAX_SAFE_INTEGER, 10 ** 15]) {
    assert.equal(verifyExpiring(key, 'clave.webp', exp, signature, now), 'invalid', String(exp));
  }
});
