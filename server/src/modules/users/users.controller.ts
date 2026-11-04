import type { Request, Response } from 'express';
import { sendPage } from '../../utils/page.js';
import type { ProfileInput } from './users.schema.js';
import * as usersService from './users.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio.

// requireAuth va antes en la ruta: aquí siempre hay usuario.
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const { displayName } = res.locals.validated.body as ProfileInput;
  const user = await usersService.updateProfile(res.locals.user!, displayName, { ip: req.ip ?? null, requestId: res.locals.requestId });
  res.locals.user = user;
  res.json({ user: usersService.toUserDto(user) });
}

// /perfil: requirePageAuth va antes en la ruta (sin sesión, 302 a /entrar).
export async function profilePage(_req: Request, res: Response): Promise<void> {
  await sendPage(res, 'profile', usersService.profilePageValues(res.locals.user!));
}
