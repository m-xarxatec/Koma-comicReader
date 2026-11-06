import { Router } from 'express';
import { uploadRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuthor } from '../../middlewares/roles.js';
import { uploadImage } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import { comicParams } from '../comics/comics.schema.js';
import * as controller from './chapters.controller.js';
import { authorChapterParams, authorPanelParams, createChapterBody, movePanelBody } from './chapters.schema.js';

// Contrato de la API del bloque 3 (docs/plan_mvp.md, "Capítulos y viñetas"). Se monta en /api, después de `auth`.
// Orden: validate (params; una ruta que no puede existir es 404) → requireAuthor → (subidas: limitador → obra y
// capítulo comprobados → multer) → controller. La propiedad la comprueba el servicio.
export const chaptersRouter = Router();
const notFound = { notFound: ['params'] } as const;
const CHAPTERS = '/author/comics/:slug/chapters';
const CHAPTER = `${CHAPTERS}/:number`;
const PANEL = `${CHAPTER}/panels/:position`;

chaptersRouter.post(CHAPTERS, validate({ params: comicParams }, notFound), requireAuthor, validate({ body: createChapterBody }), controller.createChapter);
chaptersRouter.get(CHAPTER, validate({ params: authorChapterParams }, notFound), requireAuthor, controller.getChapter);
// RN-10, RN-13 (D19): el limitador y la comprobación previa van antes de multer (un 401, 403, 404, 409, 410 o 429
// no escribe nada en disco).
chaptersRouter.post(
  `${CHAPTER}/panels`,
  validate({ params: authorChapterParams }, notFound),
  requireAuthor,
  uploadRateLimit,
  controller.checkPanelUpload,
  uploadImage,
  controller.uploadPanel,
);
chaptersRouter.delete(PANEL, validate({ params: authorPanelParams }, notFound), requireAuthor, controller.deletePanel);
chaptersRouter.patch(PANEL, validate({ params: authorPanelParams }, notFound), requireAuthor, validate({ body: movePanelBody }), controller.movePanel);
chaptersRouter.post(`${CHAPTER}/submit`, validate({ params: authorChapterParams }, notFound), requireAuthor, controller.submitChapter);
chaptersRouter.post(`${CHAPTER}/withdraw`, validate({ params: authorChapterParams }, notFound), requireAuthor, controller.withdrawChapter);
