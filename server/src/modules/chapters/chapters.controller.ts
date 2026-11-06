import type { NextFunction, Request, Response } from 'express';
import type { AuthorChapterParams, AuthorPanelParams, CreateChapterInput, MovePanelInput } from './chapters.schema.js';
import * as chaptersService from './chapters.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio. requireAuthor va antes en cada ruta: aquí siempre hay usuario.

const context = (req: Request, res: Response) => ({ ip: req.ip ?? null, requestId: res.locals.requestId });
const chapterRef = (res: Response) => res.locals.validated.params as AuthorChapterParams;

export async function createChapter(req: Request, res: Response): Promise<void> {
  const { slug } = res.locals.validated.params as { slug: string };
  const chapter = await chaptersService.createChapter(res.locals.user!, slug, res.locals.validated.body as CreateChapterInput, context(req, res));
  res.status(201).json({ chapter });
}

export async function getChapter(_req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store').json({ chapter: await chaptersService.getChapter(res.locals.user!, chapterRef(res)) });
}

// Antes de multer: si la subida no puede prosperar, no se escribe nada en disco.
export async function checkPanelUpload(_req: Request, res: Response, next: NextFunction): Promise<void> {
  await chaptersService.checkPanelUpload(res.locals.user!, chapterRef(res));
  next();
}

export async function uploadPanel(req: Request, res: Response): Promise<void> {
  const panel = await chaptersService.uploadPanel(res.locals.user!, chapterRef(res), req.file, context(req, res));
  res.status(201).json({ panel });
}

export async function deletePanel(req: Request, res: Response): Promise<void> {
  const { position, ...ref } = res.locals.validated.params as AuthorPanelParams;
  await chaptersService.deletePanel(res.locals.user!, ref, position, context(req, res));
  res.status(204).end();
}

export async function movePanel(_req: Request, res: Response): Promise<void> {
  const { position, ...ref } = res.locals.validated.params as AuthorPanelParams;
  const { position: to } = res.locals.validated.body as MovePanelInput;
  res.json({ chapter: await chaptersService.movePanel(res.locals.user!, ref, position, to) });
}

export async function submitChapter(req: Request, res: Response): Promise<void> {
  res.json({ chapter: await chaptersService.submitChapter(res.locals.user!, chapterRef(res), context(req, res)) });
}

export async function withdrawChapter(req: Request, res: Response): Promise<void> {
  await chaptersService.withdrawChapter(res.locals.user!, chapterRef(res), context(req, res));
  res.status(204).end();
}
