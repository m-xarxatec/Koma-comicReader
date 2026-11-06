import { Router } from 'express';
import { uploadRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth, requireAuthor, requirePageAuthor } from '../../middlewares/roles.js';
import { uploadImage } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './comics.controller.js';
import { catalogQuery, comicParams, createComicBody } from './comics.schema.js';

// Contrato de la API del bloque 2 (docs/plan_mvp.md). Se monta en /api, después de `auth`.
// Catálogo, etiquetas y ficha son públicos (también para el invitado): solo leen obras aprobadas y no
// retiradas. Un slug no válido es 404 (contrato), no 400.
export const comicsRouter = Router();

comicsRouter.get('/tags', controller.listTags);
comicsRouter.get('/comics', validate({ query: catalogQuery }), controller.listComics);
comicsRouter.get('/comics/:slug', validate({ params: comicParams }, { notFound: ['params'] }), controller.getComic);

// Obras del autor (contrato del bloque 3; CU-28). requireAuthor: sesión e is_author (un admin nunca lo es). La
// propiedad de cada obra la comprueba el servicio.
comicsRouter.get('/author/comics', requireAuthor, controller.listAuthorComics);
comicsRouter.post('/author/comics', requireAuthor, validate({ body: createComicBody }), controller.createComic);
// CU-30, RN-06 (D13): una sola ruta para el autor dueño y el admin (el servicio decide).
comicsRouter.post('/comics/:slug/withdraw', validate({ params: comicParams }, { notFound: ['params'] }), requireAuth, controller.withdrawComic);
// D7, RN-10, RN-13: portada opcional. El limitador de subidas (D19) y la comprobación de la obra van antes de multer.
comicsRouter.put(
  '/author/comics/:slug/cover',
  validate({ params: comicParams }, { notFound: ['params'] }),
  requireAuthor,
  uploadRateLimit,
  controller.checkCover,
  uploadImage,
  controller.updateCover,
);

// Página de la ficha (mapa de rutas HTML).
export const comicsPagesRouter = Router();

comicsPagesRouter.get('/autor', requirePageAuthor, controller.authorPage);
comicsPagesRouter.get('/obra/:slug', validate({ params: comicParams }, { notFound: ['params'] }), controller.comicPage);
