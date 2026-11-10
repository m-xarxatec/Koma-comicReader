import { Router } from 'express';
import { progressRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/roles.js';
import { validate } from '../../middlewares/validate.js';
import { comicParams } from '../comics/comics.schema.js';
import * as controller from './reading.controller.js';
import { chapterParams, progressBody, readerPageParams } from './reading.schema.js';

// Contratos de la API de los bloques 2 y 5 (docs/plan_mvp.md). Se monta en /api, después de `auth`. Un slug o un
// número que no pueden existir dan 404 (contrato), no 400.
export const readingRouter = Router();
const notFound = { notFound: ['params'] } as const;

// Público, como la ficha: no guarda nada (ningún GET modifica datos).
readingRouter.get('/comics/:slug/ad', validate({ params: comicParams }, notFound), controller.startAd);

// POST porque registra la lectura y así pasa el control CSRF por Origin. Pública: el servicio decide por rol
// y número (invitado incluido) con permissions.ts, no un middleware de permisos.
readingRouter.post('/comics/:slug/chapters/:number/read', validate({ params: chapterParams }, notFound), controller.readChapter);

// RN-21: progreso de lectura (bloque 5). Solo con sesión; el limitador, después de validar (un 400 no cuenta).
readingRouter.post(
  '/comics/:slug/chapters/:number/progress',
  requireAuth,
  validate({ params: chapterParams, body: progressBody }, notFound),
  progressRateLimit,
  controller.recordProgress,
);

// Páginas del lector (mapa de rutas HTML). La página carga y la API decide si muestra el capítulo, el
// anuncio, la invitación a registrarse o el muro de saldo; aquí solo se comprueba que el capítulo es público.
export const readingPagesRouter = Router();

readingPagesRouter.get('/leer/:slug', validate({ params: comicParams }, notFound), controller.readerStart);
readingPagesRouter.get('/leer/:slug/:numero', validate({ params: readerPageParams }, notFound), controller.readerPage);
