import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consumeCredit, createAdToken, recalculateCredits, verifyAdToken, type ReadingSettings } from '../../modules/reading/reading.rules.js';
import { deriveKey, sign } from '../../utils/signing.js';

// Reglas puras de la lectura (RN-01 y RN-02), con la hora fijada en cada caso.

const T0 = new Date('2026-11-06T10:00:00Z');
const at = (minutes: number, seconds = 0) => new Date(T0.getTime() + minutes * 60_000 + seconds * 1000);
// Valores por defecto de RN-16, con una espera de 10 min para que los periodos se distingan.
const settings: ReadingSettings = { maxBalance: 5, refill: 2, waitMinutes: 10 };

test('RN-02: sin fila, o con el periodo en NULL, el saldo es el máximo vigente', () => {
  assert.deepEqual(recalculateCredits(null, settings, T0), { balance: 5, periodStartedAt: null, retryAt: null });
  // NULL = lleno con el máximo vigente: si el admin sube el máximo, el saldo lleno sube con él.
  assert.deepEqual(recalculateCredits({ balance: 5, periodStartedAt: null }, { ...settings, maxBalance: 8 }, T0), {
    balance: 8,
    periodStartedAt: null,
    retryAt: null,
  });
});

test('RN-02: el primer consumo desde el saldo lleno abre el periodo; los siguientes no lo reinician', () => {
  const first = consumeCredit(recalculateCredits(null, settings, T0), settings, T0);
  assert.deepEqual(first, { balance: 4, periodStartedAt: T0, retryAt: at(10) });
  const second = consumeCredit(recalculateCredits(first, settings, at(3)), settings, at(3));
  assert.deepEqual(second, { balance: 3, periodStartedAt: T0, retryAt: at(10) });
});

test('RN-02: recarga 2 por periodo y, si sigue por debajo del máximo, el siguiente periodo empieza al recargar', () => {
  const empty = { balance: 0, periodStartedAt: T0 };
  assert.deepEqual(recalculateCredits(empty, settings, at(9, 59)), { balance: 0, periodStartedAt: T0, retryAt: at(10) });
  assert.deepEqual(recalculateCredits(empty, settings, at(10)), { balance: 2, periodStartedAt: at(10), retryAt: at(20) });
  // n = 2 periodos de golpe: 0 + 2 × 2 = 4; el tercero empieza en T0 + 20 min.
  assert.deepEqual(recalculateCredits(empty, settings, at(25)), { balance: 4, periodStartedAt: at(20), retryAt: at(30) });
});

test('RN-02: n periodos nunca pasan del máximo y dejan el saldo lleno, sin periodo', () => {
  const empty = { balance: 0, periodStartedAt: T0 };
  assert.deepEqual(recalculateCredits(empty, settings, at(30)), { balance: 5, periodStartedAt: null, retryAt: null }); // 0 + 3 × 2 = 6 → 5
  assert.deepEqual(recalculateCredits({ balance: 4, periodStartedAt: T0 }, settings, at(10)), { balance: 5, periodStartedAt: null, retryAt: null });
  assert.deepEqual(recalculateCredits(empty, settings, at(60 * 24 * 365)), { balance: 5, periodStartedAt: null, retryAt: null });
});

test('RN-02: sin saldo no se consume y retryAt es la próxima recarga', () => {
  const credits = recalculateCredits({ balance: 0, periodStartedAt: T0 }, settings, at(4));
  assert.equal(consumeCredit(credits, settings, at(4)), null);
  assert.deepEqual(credits.retryAt, at(10));
  // Al recargar, vuelve a poder leer.
  const refilled = recalculateCredits({ balance: 0, periodStartedAt: T0 }, settings, at(10));
  assert.deepEqual(consumeCredit(refilled, settings, at(10)), { balance: 1, periodStartedAt: at(10), retryAt: at(20) });
});

test('RN-02: los parámetros cambiados se aplican al recalcular', () => {
  const stored = { balance: 1, periodStartedAt: T0 };
  // Máximo bajado por debajo del saldo guardado: lleno con el nuevo máximo.
  assert.deepEqual(recalculateCredits({ balance: 4, periodStartedAt: T0 }, { ...settings, maxBalance: 3 }, at(1)), {
    balance: 3,
    periodStartedAt: null,
    retryAt: null,
  });
  // Espera acortada a 1 min: a los 2,5 min han pasado 2 periodos (1 + 2 × 2 = 5, lleno).
  assert.deepEqual(recalculateCredits(stored, { ...settings, waitMinutes: 1 }, at(2, 30)), { balance: 5, periodStartedAt: null, retryAt: null });
  // Recarga bajada a 1: 1 + 2 × 1 = 3, y el periodo sigue desde T0 + 2 min.
  assert.deepEqual(recalculateCredits(stored, { ...settings, waitMinutes: 1, refill: 1 }, at(2, 30)), {
    balance: 3,
    periodStartedAt: at(2),
    retryAt: at(3),
  });
  // Máximo subido con el periodo en marcha: sigue recargando hasta el nuevo máximo.
  assert.deepEqual(recalculateCredits({ balance: 4, periodStartedAt: T0 }, { ...settings, maxBalance: 8 }, at(10)), {
    balance: 6,
    periodStartedAt: at(10),
    retryAt: at(20),
  });
});

test('RN-02: un reloj por detrás del inicio del periodo no resta saldo', () => {
  assert.deepEqual(recalculateCredits({ balance: 3, periodStartedAt: T0 }, settings, at(-15)), { balance: 3, periodStartedAt: T0, retryAt: at(10) });
});

test('RN-02: con máximo 1, leer deja el saldo a 0 y la recarga lo devuelve lleno', () => {
  const one = { ...settings, maxBalance: 1 };
  const after = consumeCredit(recalculateCredits(null, one, T0), one, T0);
  assert.deepEqual(after, { balance: 0, periodStartedAt: T0, retryAt: at(10) });
  assert.deepEqual(recalculateCredits(after, one, at(10)), { balance: 1, periodStartedAt: null, retryAt: null });
});

// --- RN-01: token del anuncio ---

const SECRET = 'x'.repeat(48);
const adKey = deriveKey(SECRET, 'ad-token');
const MIN_SECONDS = 5;

test('RN-01: el token vale para su obra desde AD_MIN_SECONDS hasta 30 min después de empezar el anuncio', () => {
  const token = createAdToken(adKey, 42, T0);
  assert.equal(verifyAdToken(adKey, token, 42, at(0, 4.999), MIN_SECONDS), 'too-soon');
  assert.equal(verifyAdToken(adKey, token, 42, at(0, 5), MIN_SECONDS), 'valid');
  assert.equal(verifyAdToken(adKey, token, 42, at(30), MIN_SECONDS), 'valid');
  assert.equal(verifyAdToken(adKey, token, 42, new Date(at(30).getTime() + 1), MIN_SECONDS), 'expired');
  assert.equal(verifyAdToken(adKey, token, 42, at(-1), MIN_SECONDS), 'too-soon'); // emitido "en el futuro"
});

test('RN-01: el token de otra obra no vale', () => {
  assert.equal(verifyAdToken(adKey, createAdToken(adKey, 42, T0), 43, at(1), MIN_SECONDS), 'other-comic');
});

test('Seguridad: un token de anuncio alterado, ajeno o mal formado no vale', () => {
  const token = createAdToken(adKey, 42, T0);
  const [payload, signature] = token.split('.') as [string, string];
  const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  const encode = (text: string) => Buffer.from(text).toString('base64url');
  const forged = encode(`43.${T0.getTime()}`);
  const signed = (text: string) => `${encode(text)}.${sign(adKey, encode(text))}`;
  for (const [name, candidate] of [
    ['firma alterada', `${payload}.${flipped}`],
    ['obra cambiada con la firma original', `${forged}.${signature}`],
    ['hora adelantada con la firma original', `${encode(`42.${at(-10).getTime()}`)}.${signature}`],
    ['basura al final', `${token}A`],
    ['firma de otro uso', `${payload}.${sign(deriveKey(SECRET, 'files'), payload)}`],
    ['firma de otro secreto', createAdToken(deriveKey('y'.repeat(48), 'ad-token'), 42, T0)],
    ['sin firma', payload],
    ['vacío', ''],
    ['ausente', undefined],
    ['array', [token]],
    ['bien firmado sin forma canónica (cero a la izquierda)', signed(`042.${T0.getTime()}`)],
    ['bien firmado con hora negativa', signed(`42.-${T0.getTime()}`)],
    ['bien firmado sin hora', signed('42')],
  ] as const) {
    assert.equal(verifyAdToken(adKey, candidate, 42, at(1), MIN_SECONDS), 'invalid', name);
  }
});
