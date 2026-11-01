import type { Request, Response } from 'express';
import { clearSessionCookie, setSessionCookie } from '../../middlewares/auth.js';
import { resetLoginAttempts } from '../../middlewares/rate-limit.js';
import { sendPage } from '../../utils/page.js';
import { safeNext } from '../../utils/redirect.js';
import { toUserDto } from '../users/users.service.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';
import * as authService from './auth.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio.

function context(req: Request, res: Response): authService.RequestContext {
  return { ip: req.ip ?? null, requestId: res.locals.requestId };
}

export async function register(req: Request, res: Response): Promise<void> {
  const { user, token } = await authService.register(res.locals.validated.body as RegisterInput, context(req, res));
  res.locals.user = user; // la línea de log de esta petición lleva ya su userId
  setSessionCookie(res, token);
  res.status(201).json({ user: toUserDto(user) });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { user, token } = await authService.login(res.locals.validated.body as LoginInput, context(req, res));
  await resetLoginAttempts(req); // RN-13: un login correcto pone a cero los fallos de esta IP y correo
  res.locals.user = user; // la línea de log de esta petición lleva ya su userId
  setSessionCookie(res, token);
  res.json({ user: toUserDto(user) });
}

export async function logout(req: Request, res: Response): Promise<void> {
  await authService.logout(res.locals.user, context(req, res));
  clearSessionCookie(res);
  res.status(204).end();
}

export function me(_req: Request, res: Response): void {
  res.json({ user: res.locals.user ? toUserDto(res.locals.user) : null });
}

// Páginas /entrar y /registro (una sola plantilla, auth.html). Con sesión abierta no tiene sentido
// mostrarlas: 303 a `next` si es una ruta local segura y, si no, a la portada.
const AUTH_PAGES = {
  login: { mode: 'login', title: 'Entrar', heading: 'Entrar' },
  register: { mode: 'register', title: 'Crear cuenta', heading: 'Crear cuenta' },
} as const;

function authPage(page: keyof typeof AUTH_PAGES) {
  return async (req: Request, res: Response): Promise<void> => {
    if (res.locals.user) {
      res.redirect(303, safeNext(req.query['next']));
      return;
    }
    await sendPage(res, 'auth', AUTH_PAGES[page]);
  };
}

export const loginPage = authPage('login');
export const registerPage = authPage('register');
