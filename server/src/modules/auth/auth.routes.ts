import { Router } from 'express';
import { loginRateLimit, passwordRateLimit, registerRateLimit } from '../../middlewares/rate-limit.js';
import { requireAuth } from '../../middlewares/roles.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './auth.controller.js';
import { loginBody, passwordBody, registerBody } from './auth.schema.js';

// Contrato de la API del bloque 1 (docs/plan_mvp.md). Se monta en /api, después de `auth` y de `csrf`.
// register, login y logout son públicas: crean o cierran la sesión. `me` responde también al invitado.
// RN-13: `validate` va antes del limitador; los 400 no cuentan ni crean claves en memoria.
export const authRouter = Router();

authRouter.post('/auth/register', validate({ body: registerBody }), registerRateLimit, controller.register);
authRouter.post('/auth/login', validate({ body: loginBody }), loginRateLimit, controller.login);
authRouter.post('/auth/logout', controller.logout);
// CU-23 (D12): bajo /api/auth hereda el límite de 4 kB del cuerpo. El limitador (D11) va después de requireAuth
// (la clave es el usuario) y de validate.
authRouter.post('/auth/password', requireAuth, validate({ body: passwordBody }), passwordRateLimit, controller.changePassword);
authRouter.get('/me', controller.me);

// Páginas del mapa de rutas HTML. Se montan en la raíz, después de `auth` (necesitan saber si hay sesión).
export const authPagesRouter = Router();

authPagesRouter.get('/entrar', controller.loginPage);
authPagesRouter.get('/registro', controller.registerPage);
