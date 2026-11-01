import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from '../utils/logger.js';

declare global {
  namespace Express {
    interface Locals {
      requestId: string;
      errorCode?: string; // lo fija error-handler para la línea de log de la petición
    }
  }
}

// Asigna el requestId (cabecera X-Request-Id) y escribe una línea de log al terminar la respuesta.
export const requestId: RequestHandler = (req, res, next) => {
  const id = randomUUID();
  const start = process.hrtime.bigint();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  res.on('finish', () => {
    logger.info('request', {
      requestId: id,
      method: req.method,
      route: req.originalUrl.split('?')[0], // sin query: las URLs firmadas llevan la firma
      status: res.statusCode,
      ms: Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10,
      userId: res.locals.user?.id ?? null, // lo deja el middleware `auth` (no corre en estáticos ni /api/health)
      code: res.locals.errorCode,
    });
  });
  next();
};
