import { Router } from 'express';
import { requireAuth, requirePageAuth } from '../../middlewares/roles.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './users.controller.js';
import { profileBody } from './users.schema.js';

// Contrato de la API del bloque 3 (docs/plan_mvp.md, "Perfil"). Se monta en /api, después de `auth`.
// GET /api/me sigue en auth.routes.ts (responde también al invitado); el cambio de contraseña, en /api/auth.
export const usersRouter = Router();

usersRouter.patch('/me', requireAuth, validate({ body: profileBody }), controller.updateProfile);

// Páginas del mapa de rutas HTML. Se montan en la raíz, después de `auth`.
export const usersPagesRouter = Router();

usersPagesRouter.get('/perfil', requirePageAuth, controller.profilePage);
