import { AD_TOKEN_MAX_AGE_SECONDS } from '../../config/limits.js';
import { sign, verify } from '../../utils/signing.js';

// Reglas puras de la lectura: saldo de capítulos (RN-02) y token del anuncio del invitado (RN-01). Sin BD ni
// reloj: la hora, los parámetros y la clave llegan por parámetro. Qué exige cada capítulo según quién lee
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
