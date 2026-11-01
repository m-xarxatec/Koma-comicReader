import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';

// Reinicia la BD de las pruebas de API: DROP SCHEMA + migraciones + seed (lo ejecuta `npm run test:api`).
// Se niega a actuar si la base conectada no termina en _test: se comprueba con current_database(), no con la URL.
const TEST_DB_SUFFIX = '_test';

const requestId = randomUUID();
try {
  const { rows } = await pool.query<{ db: string }>('SELECT current_database() AS db');
  const db = rows[0]?.db ?? '';
  if (!db.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(`Me niego a vaciar «${db}»: solo actúo sobre bases que terminan en ${TEST_DB_SUFFIX}`);
  }
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  logger.info('BD de tests vaciada', { requestId, db });
  await migrate(requestId);
  await seed(requestId);
} catch (err) {
  logger.error('No se pudo reiniciar la BD de tests', { requestId, err });
  process.exitCode = 1;
} finally {
  await pool.end();
}
