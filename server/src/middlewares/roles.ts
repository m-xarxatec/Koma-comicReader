import type { RequestHandler } from 'express';
import { isAdmin, isAuthor } from '../modules/auth/permissions.js';
import { AppError } from '../utils/app-error.js';

// Protegen rutas con el usuario que `auth` dejó en res.locals.user (leído de la BD en esta petición).
// La propiedad ("la obra le pertenece") no se comprueba aquí, sino en el servicio.

const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar');
const forbidden = () => new AppError(403, 'FORBIDDEN', 'No tienes permiso para hacer esto');

export const requireAuth: RequestHandler = (_req, res, next) => {
  if (!res.locals.user) throw unauthenticated();
  next();
};

export const requireAdmin: RequestHandler = (_req, res, next) => {
  const { user } = res.locals;
  if (!user) throw unauthenticated();
  if (!isAdmin(user)) throw forbidden();
  next();
};

export const requireAuthor: RequestHandler = (_req, res, next) => {
  const { user } = res.locals;
  if (!user) throw unauthenticated();
  if (!isAuthor(user)) throw forbidden();
  next();
};

// Páginas del mapa de rutas que exigen sesión (/perfil, /autor): sin ella, 302 a /entrar con `next` = la ruta
// pedida (con su query), que el login vuelve a validar con safeNext. La API sigue respondiendo 401.
export const requirePageAuth: RequestHandler = (req, res, next) => {
  if (!res.locals.user) {
    res.redirect(302, `/entrar?${new URLSearchParams({ next: req.originalUrl })}`);
    return;
  }
  next();
};

// /autor (mapa de rutas): sin sesión, 302 al login como requirePageAuth; con sesión y sin is_author (un admin nunca
// lo es), la página 403. La API del autor lo vuelve a comprobar en cada petición (requireAuthor).
export const requirePageAuthor: RequestHandler = (req, res, next) => {
  requirePageAuth(req, res, () => {
    if (!isAuthor(res.locals.user!)) throw forbidden();
    next();
  });
};

// /admin (mapa de rutas): sin sesión, 302 al login; con sesión y sin rol admin, la página 403. La API del admin lo
// vuelve a comprobar en cada petición (requireAdmin en su router).
export const requirePageAdmin: RequestHandler = (req, res, next) => {
  requirePageAuth(req, res, () => {
    if (!isAdmin(res.locals.user!)) throw forbidden();
    next();
  });
};

// /crear (mapa de rutas), después de requirePageAuth: el autor va a su estudio con 302; quien no lo es (también el
// admin) sigue hacia la página informativa.
export const redirectAuthorToStudio: RequestHandler = (_req, res, next) => {
  if (isAuthor(res.locals.user!)) {
    res.redirect(302, '/autor');
    return;
  }
  next();
};
