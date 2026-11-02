import { randomUUID } from 'node:crypto';

// Tipo de imagen por la firma del archivo (RN-10) y su ancho y alto leídos de la cabecera (RN-18), sin
// dependencias. Función pura: no confía en la extensión ni en el Content-Type, solo en los bytes. Cualquier
// cabecera incompleta, desconocida o con medidas 0 devuelve null (el llamador lo trata como UNSUPPORTED_FILE).

export type ImageType = 'jpg' | 'png' | 'webp';

export const IMAGE_CONTENT_TYPES: Readonly<Record<ImageType, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// Claves de almacenamiento: UUID.ext generadas por el servidor (RN-10). Es la misma regex que los CHECK de
// la BD y la que valida /files/:key antes de tocar el disco.
export const IMAGE_KEY_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

export function newImageKey(type: ImageType): string {
  return `${randomUUID()}.${type}`;
}

export interface ImageInfo {
  type: ImageType; // la extensión de la clave UUID.ext sale de aquí, nunca del nombre del archivo
  width: number; // px
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const startsWith = (buf: Uint8Array, bytes: readonly number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((byte, i) => buf[offset + i] === byte);
const ascii = (buf: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...buf.subarray(offset, offset + length));
const u16be = (buf: Uint8Array, i: number) => (buf[i]! << 8) | buf[i + 1]!;
const u16le = (buf: Uint8Array, i: number) => buf[i]! | (buf[i + 1]! << 8);
const u24le = (buf: Uint8Array, i: number) => buf[i]! | (buf[i + 1]! << 8) | (buf[i + 2]! << 16);
const u32be = (buf: Uint8Array, i: number) => ((buf[i]! << 24) >>> 0) + ((buf[i + 1]! << 16) | (buf[i + 2]! << 8) | buf[i + 3]!);

function result(type: ImageType, width: number, height: number): ImageInfo | null {
  return width > 0 && height > 0 ? { type, width, height } : null;
}

// PNG: firma de 8 bytes y, justo después, el bloque IHDR con ancho y alto (32 bits, big endian).
function readPng(buf: Uint8Array): ImageInfo | null {
  if (buf.length < 24 || ascii(buf, 12, 4) !== 'IHDR') return null;
  return result('png', u32be(buf, 16), u32be(buf, 20));
}

// Marcadores SOF (inicio de imagen) que llevan las medidas: C0–CF salvo C4 (DHT), C8 (JPG) y CC (DAC).
const isStartOfFrame = (marker: number) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
// Marcadores sin longitud: TEM y RST0–RST7.
const isStandalone = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

// JPEG: se recorren los segmentos (APPn, DQT, DHT…) hasta el primer SOF; el escaneo (SOS) o el final (EOI)
// antes de un SOF significan un archivo no válido.
function readJpeg(buf: Uint8Array): ImageInfo | null {
  let i = 2; // después de FF D8
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    while (buf[i] === 0xff) i++; // bytes de relleno 0xFF permitidos entre segmentos
    if (i >= buf.length) return null;
    const marker = buf[i]!;
    i++;
    if (isStandalone(marker)) continue;
    if (marker === 0xd9 || marker === 0xda || i + 2 > buf.length) return null;
    const length = u16be(buf, i); // incluye sus propios 2 bytes
    if (length < 2) return null;
    if (isStartOfFrame(marker)) {
      if (i + 7 > buf.length) return null;
      return result('jpg', u16be(buf, i + 5), u16be(buf, i + 3)); // precisión (1), alto (2), ancho (2)
    }
    i += length;
  }
  return null;
}

// WebP: contenedor RIFF/WEBP y el primer bloque, con la imagen con pérdida (VP8), sin pérdida (VP8L) o
// extendida (VP8X: animación, transparencia o metadatos), cada uno con su forma de guardar las medidas.
function readWebp(buf: Uint8Array): ImageInfo | null {
  if (buf.length < 30 || ascii(buf, 8, 4) !== 'WEBP') return null;
  switch (ascii(buf, 12, 4)) {
    case 'VP8 ': // etiqueta de 3 bytes, código de inicio 9D 01 2A y 14 bits de ancho y de alto
      if (!startsWith(buf, [0x9d, 0x01, 0x2a], 23)) return null;
      return result('webp', u16le(buf, 26) & 0x3fff, u16le(buf, 28) & 0x3fff);
    case 'VP8L': {
      // firma 0x2F y, en 28 bits, ancho − 1 y alto − 1 (14 bits cada uno)
      if (buf[20] !== 0x2f) return null;
      const bits = buf[21]! | (buf[22]! << 8) | (buf[23]! << 16) | (buf[24]! << 24);
      return result('webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    case 'VP8X': // lienzo: ancho − 1 y alto − 1 en 24 bits little endian
      return result('webp', u24le(buf, 24) + 1, u24le(buf, 27) + 1);
    default:
      return null;
  }
}

export function readImageInfo(buf: Uint8Array): ImageInfo | null {
  if (startsWith(buf, PNG_SIGNATURE)) return readPng(buf);
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return readJpeg(buf);
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46])) return readWebp(buf); // RIFF
  return null;
}
