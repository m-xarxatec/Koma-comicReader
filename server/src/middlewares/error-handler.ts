import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ErrorRequestHandler, Request } from 'express';
import { paths } from '../config/paths.js';
import { AppError, type ErrorCode } from '../utils/app-error.js';
import { FOOTER_MARKER, HEADER_MARKER, renderTemplate } from '../utils/layout.js';
import { logger } from '../utils/logger.js';

const ERROR_PAGES = new Set([403, 404, 410, 500, 503]); // client/public/errors/<código>.html
// Errores 4xx de body-parser (campo `type`) → código de la tabla de errores del plan. Los demás tipos
// (stream.encoding.set, stream.not.readable) son fallos del servidor y quedan en 500.
const INCOMPLETE = 'La petición llegó incompleta';
const UNSUPPORTED = 'El formato de la petición no es compatible';
const BODY_PARSER_ERRORS: Record<string, [status: number, code: ErrorCode, message: string]> = {
  'entity.parse.failed': [400, 'VALIDATION_ERROR', 'El cuerpo de la petición no es un JSON válido'],
  'request.aborted': [400, 'VALIDATION_ERROR', INCOMPLETE],
  'request.size.invalid': [400, 'VALIDATION_ERROR', INCOMPLETE],
  'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', 'La petición es demasiado grande'],
  'charset.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE', UNSUPPORTED],
  'encoding.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE', UNSUPPORTED],
};
// Red de Node y SQLSTATE de conexión (clase 08), arranque o parada (57P01–57P03) y saturación (53300).
const DB_UNAVAILABLE_CODES = /^(ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|08[0-9A-Z]{3}|57P0[1-3]|53300)$/;
const DB_UNAVAILABLE_MESSAGES = /timeout exceeded when trying to connect|Connection terminated/;

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const { type, code, message } = (err ?? {}) as { type?: unknown; code?: unknown; message?: unknown };
  const bodyError = typeof type === 'string' && Object.hasOwn(BODY_PARSER_ERRORS, type) ? BODY_PARSER_ERRORS[type] : undefined;
  if (bodyError) {
    const [status, errorCode, errorMessage] = bodyError;
    return new AppError(status, errorCode, errorMessage, { cause: err });
  }
  if (
    (typeof code === 'string' && DB_UNAVAILABLE_CODES.test(code)) ||
    (typeof message === 'string' && DB_UNAVAILABLE_MESSAGES.test(message))
  ) {
    return new AppError(503, 'SERVICE_UNAVAILABLE', 'El servicio no está disponible; inténtalo en unos minutos', { cause: err });
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Ha ocurrido un error inesperado', { cause: err });
}

function isApi(req: Request): boolean {
  return req.path === '/api' || req.path.startsWith('/api/');
}

// Para los códigos sin plantilla (400, 413, 415, 429…). Cabecera y pie salen de layout.ts, como en
// client/public/errors/*.html; los valores se inyectan escapados.
const GENERIC_PAGE = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Error {{status}} · Koma</title>
  <link rel="icon" href="/icons/favicon.svg">
  <link rel="stylesheet" href="/styles/variables.css">
  <link rel="stylesheet" href="/styles/base.css">
  <link rel="stylesheet" href="/styles/components/site-header.css">
  <link rel="stylesheet" href="/styles/components/site-footer.css">
  <link rel="stylesheet" href="/styles/components/error-page.css">
</head>
<body>
  ${HEADER_MARKER}
  <main id="contenido" class="page error-page">
    <p class="error-page__status">Error {{status}}</p>
    <h1 class="error-page__title">{{message}}</h1>
    <ul class="error-page__actions">
      <li><a class="error-page__action error-page__action--primary" href="/">Ir al inicio</a></li>
      <li><a class="error-page__action" href="/#catalogo">Explorar el catálogo</a></li>
    </ul>
    <p class="error-page__ref">Código de referencia: <code>{{requestId}}</code></p>
  </main>
  ${FOOTER_MARKER}
</body>
</html>
`;

function genericPage(error: AppError, requestId: string): string {
  return renderTemplate(GENERIC_PAGE, { status: String(error.status), message: error.message, requestId });
}

// Página del código (o 500.html para otros 5xx), con cabecera, pie y {{requestId}} escapado; si no
// existe, la genérica.
async function renderErrorPage(error: AppError, requestId: string): Promise<string> {
  const page = ERROR_PAGES.has(error.status) ? error.status : error.status >= 500 ? 500 : null;
  if (page !== null) {
    try {
      const template = await readFile(path.join(paths.publicDir, 'errors', `${page}.html`), 'utf8');
      return renderTemplate(template, { requestId });
    } catch (err) {
      if ((err as { code?: unknown }).code !== 'ENOENT') logger.warn('Plantilla de error ilegible', { requestId, page, err });
    }
  }
  return genericPage(error, requestId);
}

// Decide código y formato de cualquier error: JSON en /api/*, página HTML en el resto; nunca 200.
export const errorHandler: ErrorRequestHandler = async (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const error = toAppError(err);
  const { requestId } = res.locals;
  res.locals.errorCode = error.code;
  if (error.status >= 500) logger.error(error.message, { requestId, code: error.code, err: error.cause ?? error });

  res.status(error.status);
  // 429: cuántos segundos esperar (RN-13). READING_LIMIT (403) lleva solo retryAt en el cuerpo.
  if (error.status === 429 && error.retryAt) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((error.retryAt.getTime() - Date.now()) / 1000))));
  }
  if (isApi(req)) {
    res.json({
      code: error.code,
      message: error.message,
      ...(error.fields && { fields: error.fields }),
      ...(error.retryAt && { retryAt: error.retryAt.toISOString() }),
      requestId,
    });
    return;
  }
  res.set('Cache-Control', 'no-store').type('html').send(await renderErrorPage(error, requestId));
};
