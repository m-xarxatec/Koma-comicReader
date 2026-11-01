import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { env } from '../config/env.js';
import { databaseTarget, pool, withTransaction } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { hashPassword, passwordProblem } from '../utils/password.js';

// Seeds del bloque 1 (docs/modelo_datos.md, "Seeds"): solo tablas de 001–003. Etiquetas y anuncios llegan
// con sus migraciones (bloque 2). Idempotente: ON CONFLICT DO NOTHING; nunca pisa cambios del panel.

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

// Con PAYMENTS_DRIVER=fake, la cuenta premium nace con premium_until = now() + 30 días; con stripe, NULL.
// Desde el bloque 4 lo calculará syncSubscription (RN-04).
const FAKE_PREMIUM_DAYS = 30;

export interface SeedResult {
  users: number; // filas creadas en esta ejecución
  settings: number;
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
async function auditSeed(client: PoolClient, entityType: string, entityId: string, after: object, requestId: string) {
  await client.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, after, request_id)
     VALUES (NULL, 'system.seed', $1, $2, $3::jsonb, $4)`,
    [entityType, entityId, JSON.stringify(after), requestId],
  );
}

export async function seed(requestId: string): Promise<SeedResult> {
  logger.info('Seed: destino', { requestId, ...databaseTarget(), storageDriver: env.STORAGE_DRIVER });

  const passwords = readPasswords();
  // Los hashes se calculan antes de abrir la transacción, que así dura poco.
  const hashes = new Map<PasswordVar, string>();
  for (const [passwordVar, password] of passwords) hashes.set(passwordVar, await hashPassword(password));
  const premiumDays = env.PAYMENTS_DRIVER === 'fake' ? FAKE_PREMIUM_DAYS : null;

  const result = await withTransaction(async (client) => {
    const created: SeedResult = { users: 0, settings: 0 };

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
