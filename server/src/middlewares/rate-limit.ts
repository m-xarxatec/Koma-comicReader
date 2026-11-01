import type { Request } from 'express';
import { ipKeyGenerator, rateLimit, type AugmentedRequest, type Options } from 'express-rate-limit';
import { AppError } from '../utils/app-error.js';

// RN-13. Contadores EN MEMORIA: valen porque la app corre en una sola instancia (Render, Docker).
// Si algún día se escala a varias instancias, hay que moverlos a la BD (o a un almacén compartido):
// cada instancia contaría por separado y el límite real se multiplicaría.
// req.ip sale de `trust proxy` (número de saltos, nunca true): sin eso, todos compartirían la IP del proxy.

const MINUTE_MS = 60 * 1000;
export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * MINUTE_MS;
export const REGISTER_LIMIT = 3;
export const REGISTER_WINDOW_MS = 60 * MINUTE_MS;

// ipKeyGenerator agrupa las IPv6 por subred: si no, un atacante rotaría direcciones de su /64.
function clientIp(req: Request): string {
  return ipKeyGenerator(req.ip ?? '');
}

// Login: por IP y correo normalizado (el mismo que compara el servicio).
function loginKey(req: Request): string {
  const body: unknown = req.body;
  const email = typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string' ? body.email : '';
  return `${clientIp(req)}|${email.trim().toLowerCase()}`;
}

// 429 con el formato de la API; el error-handler añade la cabecera Retry-After a partir de retryAt.
const handler: Options['handler'] = (req, _res, next, options) => {
  const retryAt = (req as AugmentedRequest).rateLimit.resetTime ?? new Date(Date.now() + options.windowMs);
  next(new AppError(429, 'RATE_LIMITED', 'Demasiados intentos. Espera un poco y vuelve a intentarlo.', { retryAt }));
};

const common = { standardHeaders: false, legacyHeaders: false, handler } as const;

// 5 intentos / 15 min. Cuentan los fallos; un login correcto pone el contador a cero (resetLoginAttempts).
export const loginRateLimit = rateLimit({
  ...common,
  windowMs: LOGIN_WINDOW_MS,
  limit: LOGIN_LIMIT,
  keyGenerator: loginKey,
});

export async function resetLoginAttempts(req: Request): Promise<void> {
  await loginRateLimit.resetKey(loginKey(req));
}

// 3 / h por IP. Cuentan todos los intentos menos los 400 de validación, para no castigar las erratas;
// los 409 EMAIL_TAKEN sí cuentan, porque limitan la enumeración de correos.
export const registerRateLimit = rateLimit({
  ...common,
  windowMs: REGISTER_WINDOW_MS,
  limit: REGISTER_LIMIT,
  keyGenerator: clientIp,
  skipFailedRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode !== 400,
});
