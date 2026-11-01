import type { CookieOptions, RequestHandler, Response } from 'express';
import { env } from '../config/env.js';
import { resolveSession, SESSION_TTL_MS } from '../modules/auth/auth.service.js';
import type { User } from '../modules/users/users.repository.js';

declare global {
  namespace Express {
    interface Locals {
      user: User | null; // usuario de la sesión, leído de la BD en esta petición; null = invitado
    }
  }
}

export const SESSION_COOKIE = 'koma_session';

// El JWT nunca es accesible desde JavaScript (httpOnly); SameSite=Lax; Secure online (COOKIE_SECURE).
function cookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE, path: '/' };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

// Adjunta res.locals.user en cada petición (páginas y API). Los permisos se calculan con el usuario
// de la BD (status, token_version), nunca solo con el JWT: una sesión que ya no vale se trata como
// invitado y su cookie se borra.
export const auth: RequestHandler = async (req, res, next) => {
  res.locals.user = null;
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token !== '') {
    const user = await resolveSession(token);
    if (user) res.locals.user = user;
    else clearSessionCookie(res);
  }
  next();
};
