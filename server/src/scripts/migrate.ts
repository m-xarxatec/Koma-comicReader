import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../config/paths.js';
import { pool, withTransaction } from '../db/pool.js';
import { logger } from '../utils/logger.js';

const MIGRATION_FILE = /^(\d{3})_[a-z0-9_]+\.sql$/; // 001_users.sql

async function listMigrations(): Promise<string[]> {
  const files = (await readdir(paths.migrationsDir)).filter((file) => file.endsWith('.sql'));
  const invalid = files.filter((file) => !MIGRATION_FILE.test(file));
  if (invalid.length > 0) throw new Error(`Nombre de migración inválido: ${invalid.join(', ')}`);
  return files.sort();
}

// Aplica en orden numérico las migraciones pendientes, cada una en su transacción.
// La usan `npm run migrate` y server.ts al arrancar.
export async function migrate(requestId: string): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const { rows } = await pool.query<{ version: string }>('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.version));
  const pending = (await listMigrations()).filter((file) => !applied.has(path.basename(file, '.sql')));

  for (const file of pending) {
    const version = path.basename(file, '.sql');
    const sql = await readFile(path.join(paths.migrationsDir, file), 'utf8');
    try {
      await withTransaction(async (client) => {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      });
    } catch (err) {
      throw new Error(`Migración ${version} fallida`, { cause: err });
    }
    logger.info('Migración aplicada', { requestId, version });
  }
  logger.info('Migraciones al día', { requestId, applied: pending.length, total: applied.size + pending.length });
}

if (import.meta.main) {
  const requestId = randomUUID();
  try {
    await migrate(requestId);
  } catch (err) {
    logger.error('No se pudieron aplicar las migraciones', { requestId, err });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
