import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { paths } from './config/paths.js';
import { pingDatabase } from './db/pool.js';
import { csrf } from './middlewares/csrf.js';
import { errorHandler } from './middlewares/error-handler.js';
import { requestId } from './middlewares/request-id.js';
import { trailingSlash } from './middlewares/trailing-slash.js';
import { AppError } from './utils/app-error.js';
import { sendPage } from './utils/page.js';

// URLs prefirmadas de R2: bucket como subdominio o en la ruta.
const r2Hosts =
  env.STORAGE_DRIVER === 'r2'
    ? [
        `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        `https://${env.R2_BUCKET}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      ]
    : [];
// HSTS, COOP y upgrade-insecure-requests solo con HTTPS (online). Sobre http (desarrollo y demo en la LAN) no se
// envían: el navegador ignora HSTS y COOP fuera de un contexto seguro, y COOP deja un aviso en la consola.
const isHttps = new URL(env.APP_URL).protocol === 'https:';
const JSON_BODY_LIMIT = '100kb'; // más → 413 PAYLOAD_TOO_LARGE

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

// (Bloque 4) El webhook de Stripe se registra aquí, con express.raw(), antes de csrf y express.json().
app.use(csrf);
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(cookieParser(env.COOKIE_SECRET));

const staticOptions = { index: false, redirect: false };
app.use('/styles', express.static(path.join(paths.publicDir, 'styles'), staticOptions));
app.use('/icons', express.static(path.join(paths.publicDir, 'icons'), staticOptions));
// client/dist también contiene .d.ts y tsbuildinfo: solo se sirven los .js.
const serveJs = express.static(paths.clientDistDir, staticOptions);
app.use('/js', (req, res, next) => (req.path.endsWith('.js') ? serveJs(req, res, next) : next()));

app.get('/api/health', async (_req, res) => {
  try {
    await pingDatabase();
  } catch (err) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'La base de datos no responde', { cause: err });
  }
  res.json({ status: 'ok', db: 'ok' });
});

// Mapa de rutas HTML (docs/plan_mvp.md). Los HTML no se sirven nunca por express.static.
app.use(trailingSlash);
app.get('/', (_req, res) => sendPage(res, 'home'));

app.use(() => {
  throw new AppError(404, 'NOT_FOUND', 'La página o el recurso no existe');
});
app.use(errorHandler);
