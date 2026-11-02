import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readImageInfo } from '../../utils/image.js';

// Cabeceras construidas byte a byte (no hacen falta imágenes reales): lo que importa es la firma y dónde
// guarda cada formato el ancho y el alto.

const bytes = (...parts: (number | string | readonly number[])[]) =>
  Uint8Array.from(
    parts.flatMap((part) => (typeof part === 'number' ? [part] : typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : [...part])),
  );
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];

const png = (width: number, height: number) =>
  bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(width), be32(height), 8, 6, 0, 0, 0, be32(0));

// SOI, APP0 (JFIF), DQT de relleno y el SOF indicado con sus medidas.
const jpeg = (sof: number, width: number, height: number) =>
  bytes(
    0xff, 0xd8,
    0xff, 0xe0, be16(16), 'JFIF', 0, 1, 1, 0, be16(1), be16(1), 0, 0,
    0xff, 0xdb, be16(5), 0, 1, 2,
    0xff, sof, be16(17), 8, be16(height), be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xda, be16(8), 1, 1, 0, 0, 0x3f, 0,
  );

const riff = (chunk: string, payload: Uint8Array) => bytes('RIFF', le16(payload.length + 12), 0, 0, 'WEBP', chunk, le16(payload.length), 0, 0, [...payload]);
const vp8 = (width: number, height: number) => riff('VP8 ', bytes(0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, le16(width), le16(height), 0, 0));
const vp8l = (width: number, height: number) => {
  const bits = (width - 1) | ((height - 1) << 14);
  return riff('VP8L', bytes(0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff, 0, 0, 0, 0, 0));
};
const vp8x = (width: number, height: number) => riff('VP8X', bytes(0x10, 0, 0, 0, le24(width - 1), le24(height - 1)));

test('RN-10: reconoce JPEG, PNG y WebP por la firma y devuelve la extensión de la clave', () => {
  assert.equal(readImageInfo(png(1, 1))?.type, 'png');
  assert.equal(readImageInfo(jpeg(0xc0, 1, 1))?.type, 'jpg');
  assert.equal(readImageInfo(vp8(1, 1))?.type, 'webp');
});

test('RN-10: rechaza otros formatos aunque el nombre o la extensión digan lo contrario', () => {
  const gif = bytes('GIF89a', le16(10), le16(10), 0, 0, 0);
  const svg = bytes('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
  const wav = bytes('RIFF', 36, 0, 0, 0, 'WAVEfmt ', 16, 0, 0, 0, 1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0);
  const pdf = bytes('%PDF-1.7\n');
  for (const [name, buf] of [['GIF', gif], ['SVG', svg], ['WAV (RIFF sin WEBP)', wav], ['PDF', pdf], ['vacío', bytes()]] as const) {
    assert.equal(readImageInfo(buf), null, name);
  }
});

test('RN-18: lee ancho y alto de PNG', () => {
  assert.deepEqual(readImageInfo(png(800, 2369)), { type: 'png', width: 800, height: 2369 });
  assert.deepEqual(readImageInfo(png(70000, 3)), { type: 'png', width: 70000, height: 3 });
});

test('RN-18: lee ancho y alto de JPEG básico y progresivo, después de APPn y DQT', () => {
  assert.deepEqual(readImageInfo(jpeg(0xc0, 800, 1200)), { type: 'jpg', width: 800, height: 1200 });
  assert.deepEqual(readImageInfo(jpeg(0xc2, 1080, 2369)), { type: 'jpg', width: 1080, height: 2369 });
});

test('RN-18: en JPEG salta los bytes de relleno y no confunde DHT (C4) con un SOF', () => {
  const withFillAndDht = bytes(
    0xff, 0xd8,
    0xff, 0xff, 0xff, 0xc4, be16(4), 0, 0, // DHT tras dos rellenos
    0xff, 0xc0, be16(17), 8, be16(600), be16(400), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  );
  assert.deepEqual(readImageInfo(withFillAndDht), { type: 'jpg', width: 400, height: 600 });
});

test('RN-18: lee ancho y alto de WebP con pérdida (VP8), sin pérdida (VP8L) y extendido (VP8X)', () => {
  assert.deepEqual(readImageInfo(vp8(800, 2370)), { type: 'webp', width: 800, height: 2370 });
  assert.deepEqual(readImageInfo(vp8l(1, 16384)), { type: 'webp', width: 1, height: 16384 });
  assert.deepEqual(readImageInfo(vp8l(300, 200)), { type: 'webp', width: 300, height: 200 });
  assert.deepEqual(readImageInfo(vp8x(16777216, 2)), { type: 'webp', width: 16777216, height: 2 });
});

test('RN-10: una cabecera truncada, sin SOF o con medidas 0 no es una imagen válida', () => {
  const cases: [string, Uint8Array][] = [
    ['PNG truncado', png(800, 600).subarray(0, 20)],
    ['PNG sin IHDR', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IDAT', be32(1), be32(1))],
    ['PNG de ancho 0', png(0, 600)],
    ['JPEG truncado', jpeg(0xc0, 800, 600).subarray(0, 30)],
    ['JPEG con SOS antes del SOF', bytes(0xff, 0xd8, 0xff, 0xda, be16(8), 1, 1, 0, 0, 0x3f, 0, 0xff, 0xc0, be16(17), 8, be16(1), be16(1))],
    ['JPEG con basura entre segmentos', bytes(0xff, 0xd8, 0xff, 0xe0, be16(4), 0, 0, 0x00, 0xff, 0xc0, be16(17), 8, be16(1), be16(1))],
    ['JPEG de alto 0', jpeg(0xc0, 800, 0)],
    ['WebP VP8 sin código de inicio', riff('VP8 ', bytes(0x30, 0x01, 0x00, 0, 0, 0, le16(10), le16(10), 0, 0))],
    ['WebP VP8L sin firma', riff('VP8L', bytes(0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0))],
    ['WebP con bloque desconocido', riff('ALPH', bytes(0, 0, 0, 0, 0, 0, 0, 0, 0, 0))],
    ['WebP truncado', vp8(800, 600).subarray(0, 28)],
  ];
  for (const [name, buf] of cases) assert.equal(readImageInfo(buf), null, name);
});
