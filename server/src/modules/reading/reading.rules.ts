import { AD_TOKEN_MAX_AGE_SECONDS, GUEST_READS_MAX, INTERSTITIAL_EVERY } from '../../config/limits.js';
import { sign, verify } from '../../utils/signing.js';

// Reglas puras de la lectura: saldo de capítulos (RN-02), anuncio intersticial (RN-03), token y respuesta del
// anuncio del invitado (RN-01) y cookie de sus lecturas contadas. Sin BD ni reloj: la hora, los parámetros, las claves y la firma de
// URLs llegan por parámetro. Qué exige cada capítulo según quién lee
// (`access`) es un permiso y vive en modules/auth/permissions.ts.

// --- RN-02: saldo de capítulos ---

// Parámetros vigentes de `settings` (RN-16): reading.max_balance, reading.refill y reading.wait_minutes.
export interface ReadingSettings {
  maxBalance: number;
  refill: number;
  waitMinutes: number;
}

// Fila de reading_credits. Sin fila, o con periodStartedAt NULL, el saldo es el máximo vigente
// (modelo_datos.md, "Saldo"): si el admin sube el máximo, el saldo lleno sube con él.
export interface StoredCredits {
  balance: number;
  periodStartedAt: Date | null;
}

export interface Credits extends StoredCredits {
  retryAt: Date | null; // próxima recarga; null con el saldo lleno
}

const MINUTE_MS = 60_000;

const full = (settings: ReadingSettings): Credits => ({ balance: settings.maxBalance, periodStartedAt: null, retryAt: null });

// Saldo recalculado al consultar (cálculo perezoso, RN-02), con los parámetros vigentes:
//   n = floor((now - period_started_at) / wait)
//   balance = min(max, balance + n * refill)
//   period_started_at = balance == max ? null : period_started_at + n * wait
// Un reloj por detrás del inicio del periodo no resta saldo (n nunca es negativo).
export function recalculateCredits(stored: StoredCredits | null, settings: ReadingSettings, now: Date): Credits {
  if (stored === null || stored.periodStartedAt === null) return full(settings);
  const wait = settings.waitMinutes * MINUTE_MS;
  const start = stored.periodStartedAt.getTime();
  const periods = Math.max(0, Math.floor((now.getTime() - start) / wait));
  const balance = Math.min(settings.maxBalance, stored.balance + periods * settings.refill);
  if (balance >= settings.maxBalance) return full(settings);
  const periodStartedAt = new Date(start + periods * wait);
  return { balance, periodStartedAt, retryAt: new Date(periodStartedAt.getTime() + wait) };
}

// Primera lectura de un capítulo que gasta saldo, sobre el saldo ya recalculado. Desde el saldo lleno, el
// periodo de espera empieza ahora; si ya corría, sigue igual. Sin saldo, null: el llamador responde
// 403 READING_LIMIT con el retryAt de `credits`.
export function consumeCredit(credits: Credits, settings: ReadingSettings, now: Date): Credits | null {
  if (credits.balance <= 0) return null;
  const periodStartedAt = credits.periodStartedAt ?? now;
  return {
    balance: credits.balance - 1,
    periodStartedAt,
    retryAt: new Date(periodStartedAt.getTime() + settings.waitMinutes * MINUTE_MS),
  };
}

// --- RN-03: anuncio intersticial ---

// Una primera lectura más del registrado sin premium (caps. 1–2 incluidos; las relecturas no llegan aquí).
// Al llegar a `every`, toca el intersticial y el contador vuelve a 0. Un contador que ya pasaba de `every`
// (guardado antes de T17, cuando solo se sumaba) también da el intersticial y vuelve a 0.
export function countReadForAd(readsSinceAd: number, every: number = INTERSTITIAL_EVERY): { readsSinceAd: number; interstitial: boolean } {
  const next = readsSinceAd + 1;
  return next >= every ? { readsSinceAd: 0, interstitial: true } : { readsSinceAd: next, interstitial: false };
}

// --- RN-01: token del anuncio del invitado ---

// "<payload>.<firma>": payload = "comicId.startedAt" (startedAt en ms Unix) en base64url; firma = HMAC-SHA256
// del payload con la clave derivada `ad-token` (contrato del bloque 2). No se guarda nada en el servidor.
export function createAdToken(key: Buffer, comicId: number, now: Date): string {
  const payload = Buffer.from(`${comicId}.${now.getTime()}`).toString('base64url');
  return `${payload}.${sign(key, payload)}`;
}

export type AdTokenCheck =
  | 'valid'
  | 'invalid' // ausente, mal formado o con la firma alterada
  | 'other-comic'
  | 'too-soon' // menos de AD_MIN_SECONDS desde que empezó el anuncio
  | 'expired'; // más de AD_TOKEN_MAX_AGE_SECONDS

const AD_TOKEN = /^([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{43})$/;
// Forma canónica: sin ceros a la izquierda ni signos, como la emite createAdToken.
const AD_PAYLOAD = /^([1-9]\d{0,9})\.([1-9]\d{0,15})$/;

// Primero la firma (sobre el texto del payload tal cual llega) y después su contenido: un token manipulado da
// 'invalid', nunca otro motivo. Todo lo que no es 'valid' es 403 AD_NOT_COMPLETED.
export function verifyAdToken(key: Buffer, token: unknown, comicId: number, now: Date, minSeconds: number): AdTokenCheck {
  const parts = typeof token === 'string' ? AD_TOKEN.exec(token) : null;
  if (!parts || !verify(key, parts[1]!, parts[2]!)) return 'invalid';
  const payload = AD_PAYLOAD.exec(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
  if (!payload) return 'invalid';
  if (Number(payload[1]) !== comicId) return 'other-comic';
  const elapsedMs = now.getTime() - Number(payload[2]);
  if (elapsedMs < minSeconds * 1000) return 'too-soon';
  if (elapsedMs > AD_TOKEN_MAX_AGE_SECONDS * 1000) return 'expired';
  return 'valid';
}

// Respuesta de GET /api/comics/:slug/ad. Sin anuncios activos (solo si no se ejecutó el seed), `ad` es null y
// el token se emite igual: el lector muestra la cuenta atrás sin tarjeta y el cap. 3 no se bloquea (aprobado
// el 2-nov). La imagen, si la hay, con URL firmada.
export interface AdInput {
  brand: string;
  body: string;
  imageKey: string | null;
}

export interface AdDto {
  brand: string;
  body: string;
  imageUrl: string | null; // firmada; null = tarjeta de texto
}

export interface AdStartDto {
  ad: AdDto | null;
  adToken: string;
  minSeconds: number;
}

export async function toAdDto(ad: AdInput, signUrl: (key: string) => Promise<string>): Promise<AdDto> {
  return { brand: ad.brand, body: ad.body, imageUrl: ad.imageKey ? await signUrl(ad.imageKey) : null };
}

export async function buildAdStart(
  ad: AdInput | null,
  adToken: string,
  minSeconds: number,
  signUrl: (key: string) => Promise<string>,
): Promise<AdStartDto> {
  return { ad: ad ? await toAdDto(ad, signUrl) : null, adToken, minSeconds };
}

// --- Estadísticas del invitado: cookie koma_guest_reads ---

// "<ids>.<firma>": ids de capítulo ya contados, separados por guiones (los últimos GUEST_READS_MAX), y su
// HMAC-SHA256 con la clave `guest-reads`. Una cookie ausente, alterada o mal formada cuenta como vacía.
const GUEST_READS = new RegExp(`^([1-9]\\d{0,9}(?:-[1-9]\\d{0,9}){0,${GUEST_READS_MAX - 1}})\\.([A-Za-z0-9_-]{43})$`);

export function parseGuestReads(key: Buffer, cookie: unknown): number[] {
  const parts = typeof cookie === 'string' ? GUEST_READS.exec(cookie) : null;
  if (!parts || !verify(key, parts[1]!, parts[2]!)) return [];
  return parts[1]!.split('-').map(Number);
}

// Añade el capítulo al final y conserva solo los últimos GUEST_READS_MAX.
export function addGuestRead(ids: readonly number[], chapterId: number): number[] {
  return [...ids.filter((id) => id !== chapterId), chapterId].slice(-GUEST_READS_MAX);
}

export function serializeGuestReads(key: Buffer, ids: readonly number[]): string {
  const payload = ids.join('-');
  return `${payload}.${sign(key, payload)}`;
}
