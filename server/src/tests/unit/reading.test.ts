import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addGuestRead,
  buildAdStart,
  consumeCredit,
  countReadForAd,
  createAdToken,
  parseGuestReads,
  recalculateCredits,
  serializeGuestReads,
  verifyAdToken,
  type ReadingSettings,
} from '../../modules/reading/reading.rules.js';
import { INTERSTITIAL_EVERY } from '../../config/limits.js';
import { deriveKey, sign } from '../../utils/signing.js';

// Reglas puras de la lectura (RN-01 a RN-03), con la hora fijada en cada caso.

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

// --- RN-03: anuncio intersticial ---

test('RN-03: el intersticial toca en la 5.ª, la 10.ª… primera lectura, y el contador vuelve a 0', () => {
  assert.equal(INTERSTITIAL_EVERY, 5);
  let readsSinceAd = 0;
  const shown: number[] = [];
  for (let read = 1; read <= 12; read++) {
    const counted = countReadForAd(readsSinceAd);
    if (counted.interstitial) shown.push(read);
    readsSinceAd = counted.readsSinceAd;
  }
  assert.deepEqual(shown, [5, 10]);
  assert.equal(readsSinceAd, 2);
  assert.deepEqual(countReadForAd(3), { readsSinceAd: 4, interstitial: false });
  assert.deepEqual(countReadForAd(4), { readsSinceAd: 0, interstitial: true });
});

test('RN-03: un contador guardado por encima del límite da el intersticial y vuelve a 0', () => {
  assert.deepEqual(countReadForAd(7), { readsSinceAd: 0, interstitial: true });
  assert.deepEqual(countReadForAd(0, 1), { readsSinceAd: 0, interstitial: true }, 'cada lectura');
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

// --- Respuesta de /ad (la usa readingService.startAd con lo que devuelve el repositorio) ---

const fakeSign = async (key: string) => `/firmada/${key}`;

test('RN-01: sin anuncios activos, /ad responde ad null y emite el token igual (el cap. 3 no se bloquea)', async () => {
  const token = createAdToken(adKey, 42, T0);
  assert.deepEqual(await buildAdStart(null, token, MIN_SECONDS, fakeSign), { ad: null, adToken: token, minSeconds: MIN_SECONDS });
});

test('RN-01: un anuncio con imagen sale con su URL firmada; uno de texto, con imageUrl null', async () => {
  const withImage = await buildAdStart({ brand: 'Marca', body: 'Texto', imageKey: 'clave.webp' }, 't', MIN_SECONDS, fakeSign);
  assert.deepEqual(withImage.ad, { brand: 'Marca', body: 'Texto', imageUrl: '/firmada/clave.webp' });
  const textOnly = await buildAdStart({ brand: 'Marca', body: 'Texto', imageKey: null }, 't', MIN_SECONDS, fakeSign);
  assert.deepEqual(textOnly.ad, { brand: 'Marca', body: 'Texto', imageUrl: null });
});

// --- Cookie koma_guest_reads (estadísticas del invitado) ---

const guestKey = deriveKey(SECRET, 'guest-reads');

test('Seguridad: la cookie del invitado guarda los capítulos contados firmados y se lee igual', () => {
  const cookie = serializeGuestReads(guestKey, [3, 17, 2]);
  assert.match(cookie, /^3-17-2\.[\w-]{43}$/);
  assert.deepEqual(parseGuestReads(guestKey, cookie), [3, 17, 2]);
});

test('Seguridad: una cookie del invitado alterada, de otro uso o mal formada cuenta como vacía', () => {
  const cookie = serializeGuestReads(guestKey, [3, 17]);
  const [payload, signature] = cookie.split('.') as [string, string];
  for (const [name, candidate] of [
    ['capítulo añadido con la firma original', `3-17-9.${signature}`],
    ['firma de otro uso', `${payload}.${serializeGuestReads(deriveKey(SECRET, 'files'), [3, 17]).split('.')[1]}`],
    ['cero a la izquierda bien firmado', serializeGuestReads(guestKey, [3]).replace(/^3/, '03')],
    ['sin firma', payload],
    ['vacía', ''],
    ['ausente', undefined],
    ['51 capítulos bien firmados', serializeGuestReads(guestKey, Array.from({ length: 51 }, (_, i) => i + 1))],
  ] as const) {
    assert.deepEqual(parseGuestReads(guestKey, candidate), [], name);
  }
});

test('Seguridad: la cookie del invitado conserva solo los últimos 50 capítulos, sin repetir', () => {
  assert.deepEqual(addGuestRead([1, 2, 3], 2), [1, 3, 2]);
  const full = Array.from({ length: 50 }, (_, i) => i + 1);
  const next = addGuestRead(full, 99);
  assert.equal(next.length, 50);
  assert.deepEqual([next[0], next.at(-1)], [2, 99]);
  assert.deepEqual(parseGuestReads(guestKey, serializeGuestReads(guestKey, next)), next);
});
