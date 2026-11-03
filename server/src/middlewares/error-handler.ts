import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ErrorRequestHandler, Request } from 'express';
import { paths } from '../config/paths.js';
import { AppError, INTERNAL_ERROR_MESSAGE, type ErrorCode } from '../utils/app-error.js';
import { FOOTER_MARKER, HEAD_MARKER, HEADER_MARKER, renderTemplate } from '../utils/layout.js';
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
  // El router no puede decodificar un parámetro de ruta con un % mal formado (/files/%E0%A4%A): ningún
  // recurso tiene ese nombre, así que es un 404, no un fallo del servidor.
  if (err instanceof URIError) return new AppError(404, 'NOT_FOUND', 'La página o el recurso no existe', { cause: err });
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
  return new AppError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE, { cause: err });
}

function isApi(req: Request): boolean {
  return req.path === '/api' || req.path.startsWith('/api/');
}

// Para los códigos sin plantilla (400, 413, 415, 429…): el diseño de client/public/errors/*.html sin
// ilustración, con el número grande. Cabecera y pie salen de layout.ts; los valores se inyectan escapados.
const GENERIC_PAGE = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${HEAD_MARKER}
  <title>Error {{status}} · Koma</title>
  <link rel="icon" href="/icons/favicon.svg">
  <link rel="stylesheet" href="/styles/variables.css">
  <link rel="stylesheet" href="/styles/layers.css">
  <link rel="stylesheet" href="/styles/base.css">
  <link rel="stylesheet" href="/styles/components/button.css">
  <link rel="stylesheet" href="/styles/components/site-header.css">
  <link rel="stylesheet" href="/styles/components/mobile-nav.css">
  <link rel="stylesheet" href="/styles/components/site-footer.css">
  <link rel="stylesheet" href="/styles/components/error-page.css">
</head>
<body>
  ${HEADER_MARKER}
  <main class="error-page container" id="contenido">
    <section class="error-page__layout" aria-labelledby="error-title">
      <div class="error-scene error-scene--generic" aria-hidden="true">
        <div class="error-scene__frame"></div>
        <div class="error-scene__halo"></div>
        <span class="error-scene__number">{{status}}</span>
        <span class="error-scene__spark error-scene__spark--one">✦</span>
        <span class="error-scene__spark error-scene__spark--two">✧</span>
      </div>
      <div class="error-copy">
        <p class="eyebrow"><span class="error-copy__dot" aria-hidden="true"></span>Error {{status}}</p>
        <h1 class="error-copy__title" id="error-title">{{message}}</h1>
        <div class="error-copy__actions">
          <a class="button button--primary" href="/">Ir al inicio</a>
          <a class="button button--outline" href="/#catalogo">Explorar el catálogo</a>
        </div>
        <p class="error-copy__reference">Código de referencia: <code class="error-copy__reference-code">{{requestId}}</code></p>
      </div>
    </section>
  </main>
  ${FOOTER_MARKER}
</body>
</html>
`;

function genericPage(error: AppError, requestId: string, requestPath: string): string {
  return renderTemplate(GENERIC_PAGE, { status: String(error.status), message: error.message, requestId }, requestPath);
}

// Página del código (o 500.html para otros 5xx), con cabecera, pie y {{requestId}} escapado; si no
// existe, la genérica.
async function renderErrorPage(error: AppError, requestId: string, requestPath: string): Promise<string> {
  const page = ERROR_PAGES.has(error.status) ? error.status : error.status >= 500 ? 500 : null;
  if (page !== null) {
    try {
      const template = await readFile(path.join(paths.publicDir, 'errors', `${page}.html`), 'utf8');
      return renderTemplate(template, { requestId }, requestPath);
    } catch (err) {
      if ((err as { code?: unknown }).code !== 'ENOENT') logger.warn('Plantilla de error ilegible', { requestId, page, err });
    }
  }
  return genericPage(error, requestId, requestPath);
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
  res.set('Cache-Control', 'no-store').type('html').send(await renderErrorPage(error, requestId, req.path));
};
