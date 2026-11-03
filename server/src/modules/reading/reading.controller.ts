import type { Request, Response } from 'express';
import * as readingService from './reading.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio.

export async function startAd(req: Request, res: Response): Promise<void> {
  const result = await readingService.startAd(req.params['slug'] as string);
  res.set('Cache-Control', 'no-store').json(result); // el token lleva la hora: cada petición, uno nuevo
}
