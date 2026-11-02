import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import * as controller from './comics.controller.js';
import { catalogQuery } from './comics.schema.js';

// Contrato de la API del bloque 2 (docs/plan_mvp.md). Se monta en /api, después de `auth`.
// Catálogo y etiquetas son públicos (también para el invitado): solo leen obras aprobadas y no retiradas.
export const comicsRouter = Router();

comicsRouter.get('/tags', controller.listTags);
comicsRouter.get('/comics', validate({ query: catalogQuery }), controller.listComics);
