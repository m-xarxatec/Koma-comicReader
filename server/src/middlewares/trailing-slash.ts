import type { RequestHandler } from 'express';

// Ruta sin la barra final, o null si no hay que redirigir. Solo devuelve rutas locales: quitar la barra
// de `//evil.com/` o `/\evil.com/` daría una redirección a otro sitio (el navegador trata `\` como `/`).
export function withoutTrailingSlash(path: string): string | null {
  if (path === '/' || !path.endsWith('/')) return null;
  const target = path.replace(/\/+$/, '');
  return /^\/[^/\\]/.test(target) ? target : null;
}

// Mapa de rutas HTML: cualquier página con `/` final → 301 a la ruta sin ella, conservando la query.
// La API no se redirige (un 301 convertiría un POST en GET).
export const trailingSlash: RequestHandler = (req, res, next) => {
  const isPage = (req.method === 'GET' || req.method === 'HEAD') && req.path !== '/api' && !req.path.startsWith('/api/');
  const target = isPage ? withoutTrailingSlash(req.path) : null;
  if (target === null) {
    next();
    return;
  }
  const queryStart = req.originalUrl.indexOf('?');
  res.redirect(301, target + (queryStart === -1 ? '' : req.originalUrl.slice(queryStart)));
};
