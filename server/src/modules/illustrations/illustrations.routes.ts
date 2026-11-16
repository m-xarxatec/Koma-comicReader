import { Router } from 'express';
import { uploadRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/roles.js';
import { discardUpload, uploadIllustration } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './illustrations.controller.js';
import { boardQuery, illustrationBody, illustrationParams, ownQuery } from './illustrations.schema.js';

// Contrato de la API del bloque 6, «Comunidad» (docs/plan_mvp.md; CU-18 sin reto; RN-22). Se monta en /api, después
// de `auth`. El tablero es público; la revisión del admin va en admin.routes.ts (/api/admin/illustrations).
export const illustrationsRouter = Router();

illustrationsRouter.get('/illustrations', validate({ query: boardQuery }), controller.listBoard);
// Publicar (D2–D6). Orden: sesión → permiso (no admin) y tope de 5 pendientes → limitador de subidas (RN-13) → multer
// → texto validado con zod → servicio. discardUpload borra el temporal si algo falla después de multer.
illustrationsRouter.post(
  '/illustrations',
  requireAuth,
  controller.checkPublisher,
  uploadRateLimit,
  uploadIllustration,
  validate({ body: illustrationBody }),
  controller.publish,
  discardUpload,
);
illustrationsRouter.get('/me/illustrations', requireAuth, validate({ query: ownQuery }), controller.listOwn);
// Una sola ruta para el dueño y el admin (el servicio decide), como la retirada de una obra.
illustrationsRouter.post('/illustrations/:id/withdraw', validate({ params: illustrationParams }, { notFound: ['params'] }), requireAuth, controller.withdraw);
