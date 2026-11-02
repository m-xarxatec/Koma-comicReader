import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

// Firmas HMAC-SHA256 con claves derivadas de COOKIE_SECRET, una por uso (contrato del bloque 2): una firma
// hecha para un uso nunca vale para otro. Funciones puras: el secreto llega por parámetro (los tests
// unitarios no cargan config/env.ts).

export type SigningLabel =
  | 'ad-token' // token del anuncio del invitado (RN-01)
  | 'files' // URLs de /files/:key con el driver local
  | 'guest-reads'; // cookie con los capítulos ya contados del invitado (estadísticas)

const KEY_BYTES = 32;
const SALT = 'koma'; // fijo: la separación entre usos la da la etiqueta (`info` de HKDF)

export function deriveKey(secret: string, label: SigningLabel): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, SALT, label, KEY_BYTES));
}

// Firma en base64url (43 caracteres): cabe en URLs, cabeceras y cookies sin escapar.
export function sign(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data).digest('base64url');
}

// Compara el texto de la firma, no sus bytes decodificados: base64url ignora caracteres sobrantes y una
// firma con basura añadida podría pasar. Longitud distinta → no vale (timingSafeEqual exige la misma).
export function verify(key: Buffer, data: string, signature: string): boolean {
  const expected = Buffer.from(sign(key, data));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type ExpiringCheck = 'valid' | 'invalid' | 'expired';

// Firma de `data` válida hasta `exp` (segundos Unix). Cambiar `exp` invalida la firma.
export function signExpiring(key: Buffer, data: string, exp: number): string {
  return sign(key, `${data}\n${exp}`);
}

// Primero la firma y después la caducidad: un `exp` manipulado da 'invalid', no 'expired'.
export function verifyExpiring(key: Buffer, data: string, exp: number, signature: string, nowSeconds: number): ExpiringCheck {
  if (!verify(key, `${data}\n${exp}`, signature)) return 'invalid';
  return exp > nowSeconds ? 'valid' : 'expired';
}
