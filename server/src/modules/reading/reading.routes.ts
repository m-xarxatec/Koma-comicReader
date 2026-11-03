import { Router } from 'express';
import * as controller from './reading.controller.js';

// Contrato de la API del bloque 2 (docs/plan_mvp.md). Se monta en /api, después de `auth`. El slug y el
// número no pasan por zod: uno que no puede existir es 404 (contrato), no 400.
export const readingRouter = Router();

// Público, como la ficha: no guarda nada (ningún GET modifica datos).
readingRouter.get('/comics/:slug/ad', controller.startAd);
