import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { GUEST_READS_COOKIE_DAYS } from '../../config/limits.js';
import type { ComicParams } from '../comics/comics.schema.js';
import type { ChapterParams } from './reading.schema.js';
import * as readingService from './reading.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio.

export const GUEST_READS_COOKIE = 'koma_guest_reads';

export async function startAd(_req: Request, res: Response): Promise<void> {
  const { slug } = res.locals.validated.params as ComicParams;
  const result = await readingService.startAd(slug);
  res.set('Cache-Control', 'no-store').json(result); // el token lleva la hora: cada petición, uno nuevo
}

// El token del anuncio viaja en una cabecera, nunca en la URL, para que no quede en los logs. La cookie de
// lecturas contadas del invitado (decisión D3): httpOnly, SameSite=Lax, Secure según COOKIE_SECURE, 30 días.
export async function readChapter(req: Request, res: Response): Promise<void> {
  const { slug, number } = res.locals.validated.params as ChapterParams;
  const { reading, guestReadsCookie } = await readingService.readChapter(slug, number, res.locals.user, {
    adToken: req.get('x-ad-token'),
    guestReadsCookie: req.cookies?.[GUEST_READS_COOKIE],
  });
  if (guestReadsCookie) {
    res.cookie(GUEST_READS_COOKIE, guestReadsCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.COOKIE_SECURE,
      path: '/',
      maxAge: GUEST_READS_COOKIE_DAYS * 24 * 60 * 60 * 1000,
    });
  }
  res.set('Cache-Control', 'no-store').json({ reading }); // URLs firmadas nuevas en cada lectura
}
