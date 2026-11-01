import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from './helpers.js';

// TEMPORAL, como el endpoint: se borra con él cuando TRUST_PROXY esté verificado en Render (RN-13).
// Un salto de proxy de confianza, como si la app estuviera detrás de uno. Se fija antes de que before()
// importe `app`, porque config/env.ts lee las variables al cargarse; cada archivo corre en su propio proceso.
process.env.TRUST_PROXY = '1';

const srv = startTestServer();

interface DebugIp {
  ip: string | null;
  xForwardedFor: string | null;
  remoteAddress: string | null;
  trustProxy: number;
}

const debugIp = (headers: Record<string, string> = {}) => fetch(`${srv.baseUrl}/api/debug/ip`, { headers });

test('RN-13: /api/debug/ip devuelve req.ip, X-Forwarded-For, la dirección del socket y TRUST_PROXY, sin caché', async () => {
  // El cliente inventa la primera entrada; la última la añade el proxy de confianza (1 salto).
  const res = await debugIp({ 'X-Forwarded-For': '203.0.113.7, 198.51.100.9' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await res.json()) as DebugIp, {
    ip: '198.51.100.9',
    xForwardedFor: '203.0.113.7, 198.51.100.9',
    remoteAddress: '127.0.0.1',
    trustProxy: 1,
  });
});

test('RN-13: sin X-Forwarded-For, /api/debug/ip devuelve la dirección del socket como req.ip', async () => {
  const body = (await (await debugIp()).json()) as DebugIp;
  assert.equal(body.ip, '127.0.0.1');
  assert.equal(body.xForwardedFor, null);
});
