import pg from 'pg';
import type { PoolClient } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const CONNECTION_TIMEOUT_MS = 5000; // sin BD, /api/health responde 503 en vez de colgarse

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
});

// Un cliente inactivo que pierde la conexión emite 'error'; sin este manejador el proceso caería.
pool.on('error', (err) => logger.error('Error en un cliente inactivo del pool', { err }));

// `pool` fuera de una transacción o el `client` de `withTransaction` dentro de ella.
export type Queryable = pg.Pool | PoolClient;

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      broken = true; // la conexión no es fiable: se descarta en vez de volver al pool
    }
    throw err;
  } finally {
    client.release(broken);
  }
}

export async function pingDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}

// Host y base de datos de DATABASE_URL, sin credenciales: los scripts los imprimen al empezar.
export function databaseTarget(): { dbHost: string; dbName: string } {
  const url = new URL(env.DATABASE_URL);
  return { dbHost: url.hostname, dbName: decodeURIComponent(url.pathname.slice(1)) };
}
