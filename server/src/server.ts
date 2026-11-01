import { randomUUID } from 'node:crypto';
import { app } from './app.js';
import { env } from './config/env.js';
import { migrate } from './scripts/migrate.js';
import { logger } from './utils/logger.js';

// Un fallo no previsto deja el proceso en estado dudoso: se registra y se termina (el hosting lo reinicia).
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { err: reason });
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { err });
  process.exit(1);
});

const requestId = randomUUID(); // identifica el arranque en los logs
try {
  await migrate(requestId); // una migración rota impide arrancar
} catch (err) {
  logger.error('No se pudieron aplicar las migraciones', { requestId, err });
  process.exit(1);
}

app.listen(env.PORT, env.HOST, (err) => {
  if (err) {
    logger.error('No se pudo abrir el puerto', { requestId, err });
    process.exit(1);
  }
  logger.info('Servidor escuchando', { requestId, url: `http://${env.HOST}:${env.PORT}`, nodeEnv: env.NODE_ENV });
});
