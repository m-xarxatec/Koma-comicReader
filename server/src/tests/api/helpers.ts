import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before } from 'node:test';

export interface TestServer {
  baseUrl: string; // http://127.0.0.1:<puerto>, disponible desde before()
  origin: string; // primer origen de ALLOWED_ORIGINS, para pasar el control CSRF
}

// Común a todos los tests de API: importa `app` de app.ts, lo levanta con listen(0) en before() y,
// en after(), cierra el servidor y el pool de la BD (si no, sus conexiones inactivas mantienen vivo
// el proceso ~10 s). `app` se importa dentro de before() para que cada archivo pueda fijar process.env
// antes: config/env.ts lee las variables al cargarse y cada archivo de test corre en su propio proceso.
export function startTestServer(): TestServer {
  const state: TestServer = { baseUrl: '', origin: '' };
  let server: Server | undefined;

  before(async () => {
    const { app } = await import('../../app.js');
    const { env } = await import('../../config/env.js');
    state.origin = env.ALLOWED_ORIGINS[0]!;
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    state.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    if (server) {
      const listening = server;
      listening.closeAllConnections();
      await new Promise((resolve) => listening.close(resolve));
    }
    const { pool } = await import('../../db/pool.js');
    await pool.end();
  });

  return state;
}
