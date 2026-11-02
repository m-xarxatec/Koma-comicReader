import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { env } from '../config/env.js';
import { databaseTarget, pool, withTransaction } from '../db/pool.js';
import * as audit from '../modules/audit/audit.service.js';
import { logger } from '../utils/logger.js';
import { hashPassword, passwordProblem } from '../utils/password.js';

// Seeds de docs/modelo_datos.md ("Seeds"): bloque 1 (cuentas demo y settings) y bloque 2 (etiquetas base y
// anuncios). Idempotente: ON CONFLICT DO NOTHING; nunca pisa cambios del panel. Las obras no van aquí: llegan
// con `npm run content:import` (RN-18).

type PasswordVar = 'SEED_ADMIN_PASSWORD' | 'SEED_AUTHOR_PASSWORD' | 'SEED_PREMIUM_PASSWORD' | 'SEED_READER_PASSWORD';

interface DemoAccount {
  email: string;
  displayName: string;
  passwordVar: PasswordVar;
  role: 'user' | 'admin';
  isAuthor: boolean;
  isPremium: boolean;
}

const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { email: 'admin@demo.test', displayName: 'Admin Demo', passwordVar: 'SEED_ADMIN_PASSWORD', role: 'admin', isAuthor: false, isPremium: false },
  { email: 'author@demo.test', displayName: 'Autora Demo', passwordVar: 'SEED_AUTHOR_PASSWORD', role: 'user', isAuthor: true, isPremium: false },
  { email: 'premium@demo.test', displayName: 'Lector Premium', passwordVar: 'SEED_PREMIUM_PASSWORD', role: 'user', isAuthor: false, isPremium: true },
  { email: 'reader@demo.test', displayName: 'Lector Demo', passwordVar: 'SEED_READER_PASSWORD', role: 'user', isAuthor: false, isPremium: false },
];

// RN-16, valores de la demo.
const DEFAULT_SETTINGS: Readonly<Record<string, number>> = {
  'reading.wait_minutes': 1,
  'reading.max_balance': 5,
  'reading.refill': 2,
};

// Etiquetas base (bloque 2). Los slugs son los de modelo_datos.md; los nombres, los de la maqueta donde los tiene.
const BASE_TAGS: readonly { slug: string; name: string; type: 'genre' | 'theme' }[] = [
  { slug: 'fantasia', name: 'Fantasía', type: 'genre' },
  { slug: 'aventura', name: 'Aventura', type: 'genre' },
  { slug: 'comedia', name: 'Comedia', type: 'genre' },
  { slug: 'drama', name: 'Drama', type: 'genre' },
  { slug: 'horror', name: 'Terror', type: 'genre' },
  { slug: 'misterio', name: 'Misterio', type: 'genre' },
  { slug: 'romance', name: 'Romance', type: 'genre' },
  { slug: 'ciencia-ficcion', name: 'Ciencia ficción', type: 'genre' },
  { slug: 'magia', name: 'Magia', type: 'theme' },
  { slug: 'psicologico', name: 'Psicológico', type: 'theme' },
  { slug: 'sobrenatural', name: 'Sobrenatural', type: 'theme' },
  { slug: 'slice-of-life', name: 'Slice of Life', type: 'theme' },
];

// Anuncios de marcas inventadas, solo texto (bloque 2). Se crean solo si `ads` está vacía.
const DEMO_ADS: readonly { brand: string; body: string }[] = [
  { brand: 'Tinta Eterna', body: 'Bolígrafos que duran más que tu última racha de dibujo.' },
  { brand: 'Café Página Doble', body: 'La taza que aguanta un capítulo entero sin enfriarse.' },
  { brand: 'Gomas Arrepentidas S.A.', body: 'Borramos tus trazos, no tus recuerdos.' },
];

// Con PAYMENTS_DRIVER=fake, la cuenta premium nace con premium_until = now() + 30 días; con stripe, NULL.
// Desde el bloque 4 lo calculará syncSubscription (RN-04).
const FAKE_PREMIUM_DAYS = 30;

export interface SeedResult {
  users: number; // filas creadas en esta ejecución
  settings: number;
  tags: number;
  ads: number;
}

// Si falta o no vale alguna contraseña, no se crea nada. El mensaje nombra la variable, nunca su valor.
function readPasswords(): Map<PasswordVar, string> {
  const passwords = new Map<PasswordVar, string>();
  const problems: string[] = [];
  for (const { passwordVar } of DEMO_ACCOUNTS) {
    const password = env[passwordVar];
    const problem = password === undefined ? 'falta' : passwordProblem(password);
    if (problem !== null || password === undefined) problems.push(`${passwordVar}: ${problem}`);
    else passwords.set(passwordVar, password);
  }
  if (problems.length > 0) throw new Error(`Contraseñas de las cuentas demo no válidas (RN-12): ${problems.join('; ')}`);
  return passwords;
}

// Auditoría system.seed: actor NULL, entity_type = tabla, after = ids o claves creados (nunca contraseñas).
// Pasa por audit.service, como el resto: misma lista de acciones y mismo filtro de campos prohibidos.
async function auditSeed(client: PoolClient, entityType: string, entityId: string, after: object, requestId: string) {
  await audit.record(client, { action: 'system.seed', actorId: null, entityType, entityId, after, ip: null, requestId });
}

export async function seed(requestId: string): Promise<SeedResult> {
  logger.info('Seed: destino', { requestId, ...databaseTarget(), storageDriver: env.STORAGE_DRIVER });

  const passwords = readPasswords();
  // Los hashes se calculan antes de abrir la transacción, que así dura poco.
  const hashes = new Map<PasswordVar, string>();
  for (const [passwordVar, password] of passwords) hashes.set(passwordVar, await hashPassword(password));
  const premiumDays = env.PAYMENTS_DRIVER === 'fake' ? FAKE_PREMIUM_DAYS : null;

  const result = await withTransaction(async (client) => {
    const created: SeedResult = { users: 0, settings: 0, tags: 0, ads: 0 };

    for (const account of DEMO_ACCOUNTS) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO users (email, password_hash, display_name, role, is_author, premium_until)
         VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6::int))
         ON CONFLICT ((lower(email))) DO NOTHING
         RETURNING id`,
        [account.email, hashes.get(account.passwordVar), account.displayName, account.role, account.isAuthor, account.isPremium ? premiumDays : null],
      );
      const user = rows[0];
      if (user) {
        await auditSeed(client, 'users', String(user.id), { id: user.id, email: account.email }, requestId);
        created.users++;
      }
    }

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      const { rows } = await client.query<{ key: string }>(
        `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO NOTHING
         RETURNING key`,
        [key, JSON.stringify(value)],
      );
      if (rows[0]) {
        await auditSeed(client, 'settings', key, { key }, requestId);
        created.settings++;
      }
    }

    for (const tag of BASE_TAGS) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO tags (slug, name, type) VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO NOTHING
         RETURNING id`,
        [tag.slug, tag.name, tag.type],
      );
      const row = rows[0];
      if (row) {
        await auditSeed(client, 'tags', String(row.id), { id: row.id, slug: tag.slug }, requestId);
        created.tags++;
      }
    }

    // Una sola sentencia: inserta los tres o ninguno, según `ads` esté vacía.
    const { rows: ads } = await client.query<{ id: number; brand: string }>(
      `INSERT INTO ads (brand, body)
       SELECT brand, body FROM unnest($1::text[], $2::text[]) AS demo(brand, body)
       WHERE NOT EXISTS (SELECT 1 FROM ads)
       RETURNING id, brand`,
      [DEMO_ADS.map((ad) => ad.brand), DEMO_ADS.map((ad) => ad.body)],
    );
    for (const ad of ads) {
      await auditSeed(client, 'ads', String(ad.id), { id: ad.id, brand: ad.brand }, requestId);
      created.ads++;
    }

    return created;
  });

  logger.info('Seed aplicado', { requestId, created: result });
  return result;
}

if (import.meta.main) {
  const requestId = randomUUID();
  try {
    await seed(requestId);
  } catch (err) {
    logger.error('Seed fallido; no se ha creado nada', { requestId, err });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
