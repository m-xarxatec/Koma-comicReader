import type { Request, Response } from 'express';
import * as readingService from './reading.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio.

export async function startAd(req: Request, res: Response): Promise<void> {
  const result = await readingService.startAd(req.params['slug'] as string);
  res.set('Cache-Control', 'no-store').json(result); // el token lleva la hora: cada petición, uno nuevo
}

// El token del anuncio viaja en una cabecera, nunca en la URL, para que no quede en los logs.
export async function readChapter(req: Request, res: Response): Promise<void> {
  const reading = await readingService.readChapter(req.params['slug'] as string, req.params['number'] as string, res.locals.user, req.get('x-ad-token'));
  res.set('Cache-Control', 'no-store').json({ reading }); // URLs firmadas nuevas en cada lectura
}
