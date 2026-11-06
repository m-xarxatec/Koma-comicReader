import type { NextFunction, Request, Response } from 'express';
import { pool } from '../../db/pool.js';
import { sendPage } from '../../utils/page.js';
import type { CatalogQuery, ComicParams, CreateComicInput } from './comics.schema.js';
import * as comicsService from './comics.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio.

export async function listTags(_req: Request, res: Response): Promise<void> {
  res.json({ tags: await comicsService.listTags() });
}

export async function listComics(_req: Request, res: Response): Promise<void> {
  res.json(await comicsService.searchCatalog(res.locals.validated.query as CatalogQuery));
}

export async function getComic(_req: Request, res: Response): Promise<void> {
  const { slug } = res.locals.validated.params as ComicParams;
  res.json({ comic: await comicsService.getComic(slug, res.locals.user) });
}

// /obra/:slug (mapa de rutas HTML): obra pública (404 o 410 si no); el título va escapado en <title> y <h1>.
export async function comicPage(_req: Request, res: Response): Promise<void> {
  const { slug } = res.locals.validated.params as ComicParams;
  const comic = await comicsService.requirePublicComic(slug);
  await sendPage(res, 'comic', { title: comic.title });
}

// --- Obras del autor (contrato del bloque 3). requireAuthor va antes en la ruta: aquí siempre hay usuario. ---

export async function listAuthorComics(_req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store').json({ comics: await comicsService.listAuthorComics(res.locals.user!) });
}

export async function createComic(req: Request, res: Response): Promise<void> {
  const input = res.locals.validated.body as CreateComicInput;
  const comic = await comicsService.createComic(res.locals.user!, input, { ip: req.ip ?? null, requestId: res.locals.requestId });
  res.status(201).json({ comic });
}

// Antes de multer (D7): sin obra gestionable (404, 403, 410, 409 si se rechazó), no se escribe nada en disco.
export async function checkCover(_req: Request, res: Response, next: NextFunction): Promise<void> {
  const { slug } = res.locals.validated.params as ComicParams;
  await comicsService.requireManagedComic(pool, slug, res.locals.user!, { editable: true });
  next();
}

export async function updateCover(req: Request, res: Response): Promise<void> {
  const { slug } = res.locals.validated.params as ComicParams;
  const comic = await comicsService.updateCover(res.locals.user!, slug, req.file, { ip: req.ip ?? null, requestId: res.locals.requestId });
  res.json({ comic });
}

// requireAuth va antes en la ruta; quién puede retirarla lo decide el servicio (D13).
export async function withdrawComic(req: Request, res: Response): Promise<void> {
  const { slug } = res.locals.validated.params as ComicParams;
  await comicsService.withdrawComic(res.locals.user!, slug, { ip: req.ip ?? null, requestId: res.locals.requestId });
  res.status(204).end();
}

// /autor (D18): una sola página; la obra y el capítulo abiertos van en ?obra=&capitulo= y los lee el cliente.
// requirePageAuthor va antes. "Autor original" propone el nombre visible (contrato, CreateComicInput), escapado.
export async function authorPage(_req: Request, res: Response): Promise<void> {
  await sendPage(res, 'author', { authorCredit: res.locals.user!.displayName });
}
