import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';
import { isAllowedOrigin } from '../utils/origin.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']); // ningún GET modifica datos
const allowedOrigins: ReadonlySet<string> = new Set(env.ALLOWED_ORIGINS);

// Toda petición que modifica datos exige un `Origin` de ALLOWED_ORIGINS (por defecto, el origen de APP_URL).
// El webhook de Stripe queda exento porque se registra en app.ts antes que este middleware (se valida por firma).
export const csrf: RequestHandler = (req, _res, next) => {
  if (!SAFE_METHODS.has(req.method) && !isAllowedOrigin(req.get('origin'), allowedOrigins)) {
    throw new AppError(403, 'CSRF', 'Petición rechazada: no procede de este sitio');
  }
  next();
};
