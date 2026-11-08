import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env, JSON_BODY_LIMIT } from './config/env.js';
import { paths } from './config/paths.js';
import { pingDatabase } from './db/pool.js';
import { filesHandler } from './integrations/storage/index.js';
import { r2ImageHosts } from './integrations/storage/r2.js';
import { auth } from './middlewares/auth.js';
import { csrf } from './middlewares/csrf.js';
import { errorHandler } from './middlewares/error-handler.js';
import { requestId } from './middlewares/request-id.js';
import { trailingSlash } from './middlewares/trailing-slash.js';
import { adminPagesRouter, adminRouter } from './modules/admin/admin.routes.js';
import { authPagesRouter, authRouter } from './modules/auth/auth.routes.js';
import { chaptersRouter } from './modules/chapters/chapters.routes.js';
import { comicsPagesRouter, comicsRouter } from './modules/comics/comics.routes.js';
import { commentsRouter } from './modules/comments/comments.routes.js';
import { paymentsPagesRouter, paymentsRouter, paymentsWebhookRouter } from './modules/payments/payments.routes.js';
import { readingPagesRouter, readingRouter } from './modules/reading/reading.routes.js';
import { usersPagesRouter, usersRouter } from './modules/users/users.routes.js';
import { AppError } from './utils/app-error.js';
import { sendPage } from './utils/page.js';

// URLs prefirmadas de R2: bucket como subdominio o en la ruta (los mismos orígenes que firma r2.ts).
const r2Hosts = env.STORAGE_DRIVER === 'r2' ? r2ImageHosts(env.R2_ACCOUNT_ID!, env.R2_BUCKET!) : [];
// HSTS, COOP y upgrade-insecure-requests solo con HTTPS (online). Sobre http (desarrollo y demo en la LAN) no se
// envían: el navegador ignora HSTS y COOP fuera de un contexto seguro, y COOP deja un aviso en la consola.
const isHttps = new URL(env.APP_URL).protocol === 'https:';
// /api/auth/*: correo (254), contraseña (72 bytes) y nombre (30) caben de sobra, incluso escritos con
// escapes \uXXXX. Un cuerpo pequeño acota lo que una petición puede hacer gastar antes de validar.
const AUTH_BODY_LIMIT = '4kb';

// Sin `listen` ni migraciones: los tests de API importan `app` y lo levantan con listen(0).
export const app = express();

app.set('trust proxy', env.TRUST_PROXY); // número de saltos, nunca true (RN-13)

app.use(requestId);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", ...r2Hosts],
        connectSrc: ["'self'"],
        // El navegador aplica form-action también a las redirecciones hacia Stripe.
        formAction: ["'self'", 'https://checkout.stripe.com', 'https://billing.stripe.com'],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        ...(isHttps && { upgradeInsecureRequests: [] }),
      },
    },
    strictTransportSecurity: isHttps,
    crossOriginOpenerPolicy: isHttps,
    // Con `no-referrer` (el de serie de helmet), un POST de formulario nativo envía `Origin: null`
    // y el control CSRF lo rechazaría. `same-origin` conserva el Origin propio y no envía nada a otros sitios.
    referrerPolicy: { policy: 'same-origin' },
  }),
);

// Webhook de Stripe, solo con PAYMENTS_DRIVER=stripe (con `fake` no hay secreto con el que verificar).
// Después de requestId y antes de csrf, auth y los express.json (ver payments.routes.ts).
if (env.PAYMENTS_DRIVER === 'stripe') app.use(paymentsWebhookRouter);
app.use(csrf);
// El primero que lee el cuerpo gana: el parser general ve la petición ya leída y no hace nada.
app.use('/api/auth', express.json({ limit: AUTH_BODY_LIMIT }));
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(cookieParser(env.COOKIE_SECRET));

const staticOptions = { index: false, redirect: false };
app.use('/styles', express.static(path.join(paths.publicDir, 'styles'), staticOptions));
app.use('/icons', express.static(path.join(paths.publicDir, 'icons'), staticOptions));
// client/dist también contiene .d.ts y tsbuildinfo: solo se sirven los .js.
const serveJs = express.static(paths.clientDistDir, staticOptions);
app.use('/js', (req, res, next) => (req.path.endsWith('.js') ? serveJs(req, res, next) : next()));
// Imágenes con URL firmada del driver local (contrato del bloque 2); con r2 no existe y da 404.
if (filesHandler) app.get('/files/:key', filesHandler);

app.get('/api/health', async (_req, res) => {
  try {
    await pingDatabase();
  } catch (err) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'La base de datos no responde', { cause: err });
  }
  res.json({ status: 'ok', db: 'ok' });
});

// Sesión: a partir de aquí, res.locals.user es el usuario de la BD (o null). Va después de los
// estáticos, /files y /api/health, que no la necesitan, para no consultar la BD en cada CSS o imagen.
app.use(auth);
app.use('/api', authRouter);
app.use('/api', usersRouter);
app.use('/api', comicsRouter);
app.use('/api', chaptersRouter);
app.use('/api', readingRouter);
app.use('/api', commentsRouter);
app.use('/api', paymentsRouter);
app.use('/api/admin', adminRouter);

// Mapa de rutas HTML (docs/plan_mvp.md). Los HTML no se sirven nunca por express.static.
app.use(trailingSlash);
app.get('/', (_req, res) => sendPage(res, 'home'));
app.use(authPagesRouter);
app.use(comicsPagesRouter);
app.use(readingPagesRouter);
app.use(usersPagesRouter);
app.use(paymentsPagesRouter);
app.use(adminPagesRouter);

app.use(() => {
  throw new AppError(404, 'NOT_FOUND', 'La página o el recurso no existe');
});
app.use(errorHandler);
