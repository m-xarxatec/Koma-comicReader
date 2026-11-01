import type { Request, Response } from 'express';
import { ipKeyGenerator, MemoryStore, rateLimit, type AugmentedRequest, type Options } from 'express-rate-limit';
import { EMAIL_MAX_CHARS, type LoginInput } from '../modules/auth/auth.schema.js';
import { AppError, INTERNAL_ERROR_MESSAGE } from '../utils/app-error.js';

// RN-13. Contadores EN MEMORIA: valen porque la app corre en una sola instancia (Render, Docker).
// Si algún día se escala a varias instancias, hay que moverlos a la BD (o a un almacén compartido):
// cada instancia contaría por separado y el límite real se multiplicaría.
// req.ip sale de `trust proxy` (número de saltos, nunca true): sin eso, todos compartirían la IP del proxy.
//
// Los dos limitadores van DESPUÉS de `validate` (auth.routes.ts): un 400 no llega a ellos, así que ni cuenta
// ni crea una clave en memoria. Si la clave saliera del cuerpo sin validar, cada correo inventado (hasta el
// límite del cuerpo) ocuparía memoria durante toda la ventana.

const MINUTE_MS = 60 * 1000;
export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * MINUTE_MS;
export const REGISTER_LIMIT = 3;
export const REGISTER_WINDOW_MS = 60 * MINUTE_MS;

// ipKeyGenerator agrupa las IPv6 por subred (/56, el valor de serie de la librería): si no, un atacante
// rotaría direcciones dentro de su propio bloque.
function clientIp(req: Request): string {
  return ipKeyGenerator(req.ip ?? '');
}

// Login: por IP y correo ya validado por zod (sin espacios, en minúsculas y de 254 caracteres como mucho,
// el mismo que compara el servicio). Se recorta otra vez como defensa extra: la clave nunca crece sin límite.
function loginKey(req: Request, res: Response): string {
  const email = (res.locals.validated?.body as LoginInput | undefined)?.email;
  if (typeof email !== 'string') {
    // Fallo de programación: el limitador se montó antes de `validate`.
    throw new AppError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE, {
      cause: new Error('loginRateLimit necesita el cuerpo validado: va después de validate({ body: loginBody })'),
    });
  }
  return `${clientIp(req)}|${email.slice(0, EMAIL_MAX_CHARS)}`;
}

// 429 con el formato de la API; el error-handler añade la cabecera Retry-After a partir de retryAt.
const handler: Options['handler'] = (req, _res, next, options) => {
  const retryAt = (req as AugmentedRequest).rateLimit.resetTime ?? new Date(Date.now() + options.windowMs);
  next(new AppError(429, 'RATE_LIMITED', 'Demasiados intentos. Espera un poco y vuelve a intentarlo.', { retryAt }));
};

const common = { standardHeaders: false, legacyHeaders: false, handler } as const;

// Almacén propio del login: los tests comprueban con él que un 400 no crea claves.
export const loginStore = new MemoryStore();

// 5 fallos / 15 min. Cuenta cada intento que pasa la validación; un login correcto pone el contador a cero
// (resetLoginAttempts), así que en la práctica solo suman los fallos.
export const loginRateLimit = rateLimit({
  ...common,
  windowMs: LOGIN_WINDOW_MS,
  limit: LOGIN_LIMIT,
  keyGenerator: loginKey,
  store: loginStore,
});

export async function resetLoginAttempts(req: Request, res: Response): Promise<void> {
  await loginRateLimit.resetKey(loginKey(req, res));
}

// 3 / h por IP. Cuenta todo intento que pasa la validación y nunca lo devuelve: tampoco los 409
// EMAIL_TAKEN (limitan la enumeración de correos) ni las peticiones que el cliente corta antes de la
// respuesta, porque la cuenta se crea igualmente. Sin skipFailedRequests: esa opción descuenta también
// las conexiones cerradas antes de responder, y cortar cada petición saltaba el límite.
export const registerRateLimit = rateLimit({
  ...common,
  windowMs: REGISTER_WINDOW_MS,
  limit: REGISTER_LIMIT,
  keyGenerator: clientIp,
});
