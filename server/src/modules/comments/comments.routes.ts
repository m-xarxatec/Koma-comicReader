import { Router } from 'express';
import { commentRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/roles.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './comments.controller.js';
import { commentBody, commentParams, commentsQuery, panelParams } from './comments.schema.js';

// Contrato de la API del bloque 3 (docs/plan_mvp.md, "Comentarios por viñeta"). Se monta en /api, después de
// `auth`. Una viñeta o un comentario que no pueden existir dan 404, no 400. RN-13: el limitador va después de
// `validate` (un 400 no cuenta) y de `requireAuth` (la clave es el usuario).
export const commentsRouter = Router();
const notFound = { notFound: ['params'] } as const;
const PANEL = '/comics/:slug/chapters/:number/panels/:position/comments';

// CU-05: público (D1), también el invitado.
commentsRouter.get(PANEL, validate({ params: panelParams, query: commentsQuery }, notFound), controller.listComments);
// CU-13: el servicio comprueba además que puede leer el capítulo sin gastar saldo (D2).
commentsRouter.post(PANEL, requireAuth, validate({ params: panelParams, body: commentBody }, notFound), commentRateLimit, controller.createComment);
// RN-11: solo quien lo escribió (lo comprueba el servicio).
commentsRouter.delete('/comments/:id', requireAuth, validate({ params: commentParams }, notFound), controller.deleteComment);
