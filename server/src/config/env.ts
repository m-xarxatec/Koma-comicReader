import { z } from 'zod';
import { isValidOrigin } from '../utils/origin.js';

const secret = z.string().min(32, { error: 'Debe tener al menos 32 caracteres aleatorios' });
const positiveInt = z.coerce.number().int().positive();
// Orígenes separados por comas; cada uno exacto, como lo envía el navegador en `Origin`.
const originList = z
  .string()
  .transform((value) => value.split(',').map((entry) => entry.trim()))
  .pipe(
    z.array(
      z.string().refine(isValidOrigin, {
        error: (issue) =>
          `«${String(issue.input)}» no es un origen válido: http(s)://host[:puerto], sin ruta, barra final ni comodines`,
      }),
    ),
  );

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production']),
    PORT: z.coerce.number().int().min(1).max(65535),
    HOST: z.string(),
    APP_URL: z.url({ protocol: /^https?$/ }), // URLs absolutas que salen de la app (retorno de Stripe)
    ALLOWED_ORIGINS: originList.optional(), // control CSRF; si falta, el origen de APP_URL
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    JWT_SECRET: secret,
    COOKIE_SECRET: secret,
    COOKIE_SECURE: z.stringbool(),
    TRUST_PROXY: z.coerce.number().int().min(0), // número de saltos, nunca true (RN-13)
    AD_MIN_SECONDS: positiveInt,
    SIGNED_URL_TTL_SECONDS: positiveInt,
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']),
    CONTENT_DIR: z.string(),

    STORAGE_DRIVER: z.enum(['local', 'r2']),
    STORAGE_LOCAL_DIR: z.string(),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),

    PAYMENTS_DRIVER: z.enum(['fake', 'stripe']),
    STRIPE_SECRET_KEY: z.string().startsWith('sk_test_', { error: 'Solo claves de modo prueba (sk_test_…)' }).optional(),
    STRIPE_PRICE_ID: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_TEST_CLOCK_ID: z.string().optional(),

    // Solo las usa `npm run seed`, que exige las suyas; el servidor no las necesita.
    SEED_ADMIN_PASSWORD: z.string().optional(),
    SEED_AUTHOR_PASSWORD: z.string().optional(),
    SEED_PREMIUM_PASSWORD: z.string().optional(),
    SEED_READER_PASSWORD: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const requireVars = (keys: (keyof typeof env)[], reason: string) => {
      for (const key of keys) {
        if (env[key] === undefined) ctx.addIssue({ code: 'custom', path: [key], message: `Obligatoria ${reason}` });
      }
    };
    if (env.PAYMENTS_DRIVER === 'fake' && env.NODE_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['PAYMENTS_DRIVER'], message: 'El pago simulado está prohibido en producción' });
    }
    if (env.PAYMENTS_DRIVER === 'stripe') {
      requireVars(['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'STRIPE_WEBHOOK_SECRET'], 'con PAYMENTS_DRIVER=stripe');
    }
    if (env.STORAGE_DRIVER === 'r2') {
      requireVars(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'], 'con STORAGE_DRIVER=r2');
    }
  });

function loadEnv() {
  // `--env-file` carga "VAR=" como cadena vacía: se trata como ausente.
  const source = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''));
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const key = issue.path.join('.');
      const missing = issue.code !== 'custom' && source[key] === undefined;
      return `  - ${key}: ${missing ? 'falta (ver .env.example)' : issue.message}`;
    });
    console.error(`Configuración inválida; revisa las variables de entorno:\n${lines.join('\n')}`);
    process.exit(1);
  }
  return { ...result.data, ALLOWED_ORIGINS: result.data.ALLOWED_ORIGINS ?? [new URL(result.data.APP_URL).origin] };
}

export const env = loadEnv();
export type Env = typeof env;
