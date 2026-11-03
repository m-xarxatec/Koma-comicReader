import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { comicParams } from '../comics/comics.schema.js';
import * as controller from './reading.controller.js';
import { chapterParams } from './reading.schema.js';

// Contrato de la API del bloque 2 (docs/plan_mvp.md). Se monta en /api, después de `auth`. Un slug o un
// número que no pueden existir dan 404 (contrato), no 400.
export const readingRouter = Router();
const notFound = { notFound: ['params'] } as const;

// Público, como la ficha: no guarda nada (ningún GET modifica datos).
readingRouter.get('/comics/:slug/ad', validate({ params: comicParams }, notFound), controller.startAd);

// POST porque registra la lectura y así pasa el control CSRF por Origin. Pública: el servicio decide por rol
// y número (invitado incluido) con permissions.ts, no un middleware de permisos.
readingRouter.post('/comics/:slug/chapters/:number/read', validate({ params: chapterParams }, notFound), controller.readChapter);
