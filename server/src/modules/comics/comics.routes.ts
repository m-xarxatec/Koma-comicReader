import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import * as controller from './comics.controller.js';
import { catalogQuery } from './comics.schema.js';

// Contrato de la API del bloque 2 (docs/plan_mvp.md). Se monta en /api, después de `auth`.
// Catálogo, etiquetas y ficha son públicos (también para el invitado): solo leen obras aprobadas y no
// retiradas. El slug no pasa por zod: uno que no puede existir es 404 (contrato), no 400.
export const comicsRouter = Router();

comicsRouter.get('/tags', controller.listTags);
comicsRouter.get('/comics', validate({ query: catalogQuery }), controller.listComics);
comicsRouter.get('/comics/:slug', controller.getComic);
