import { Router } from 'express';
import { loginRateLimit, registerRateLimit } from '../../middlewares/rate-limit.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './auth.controller.js';
import { loginBody, registerBody } from './auth.schema.js';

// Contrato de la API del bloque 1 (docs/plan_mvp.md). Se monta en /api, después de `auth` y de `csrf`.
// register, login y logout son públicas: crean o cierran la sesión. `me` responde también al invitado.
export const authRouter = Router();

authRouter.post('/auth/register', registerRateLimit, validate({ body: registerBody }), controller.register);
authRouter.post('/auth/login', loginRateLimit, validate({ body: loginBody }), controller.login);
authRouter.post('/auth/logout', controller.logout);
authRouter.get('/me', controller.me);

// Páginas del mapa de rutas HTML. Se montan en la raíz, después de `auth` (necesitan saber si hay sesión).
export const authPagesRouter = Router();

authPagesRouter.get('/entrar', controller.loginPage);
authPagesRouter.get('/registro', controller.registerPage);
