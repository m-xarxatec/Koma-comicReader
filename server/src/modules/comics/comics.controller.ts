import type { Request, Response } from 'express';
import type { CatalogQuery } from './comics.schema.js';
import * as comicsService from './comics.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio.

export async function listTags(_req: Request, res: Response): Promise<void> {
  res.json({ tags: await comicsService.listTags() });
}

export async function listComics(_req: Request, res: Response): Promise<void> {
  res.json(await comicsService.searchCatalog(res.locals.validated.query as CatalogQuery));
}
