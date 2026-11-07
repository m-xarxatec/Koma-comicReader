// Comprobación pura del destino de `npm run demo:data` (sin `env`: el test unitario la importa sin .env). El
// script solo escribe en una BD local de desarrollo: nunca en producción, en Neon ni en la BD de tests, y solo con
// los drivers locales (imágenes en storage/ y pago simulado).

export interface DemoTargetInput {
  NODE_ENV?: string | undefined;
  DATABASE_URL?: string | undefined;
  STORAGE_DRIVER?: string | undefined;
  PAYMENTS_DRIVER?: string | undefined;
}

export type DemoTarget = { ok: true; dbHost: string; dbName: string } | { ok: false; reason: string };

// El host tal como lo devuelve `URL.hostname` (IPv6 entre corchetes).
export const LOCAL_DB_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

export function checkDemoTarget(input: DemoTargetInput): DemoTarget {
  if (input.NODE_ENV !== 'development') return { ok: false, reason: `NODE_ENV debe ser development (es ${input.NODE_ENV ?? 'indefinido'})` };
  if (input.STORAGE_DRIVER !== 'local') return { ok: false, reason: 'STORAGE_DRIVER debe ser local' };
  if (input.PAYMENTS_DRIVER !== 'fake') return { ok: false, reason: 'PAYMENTS_DRIVER debe ser fake' };
  let url: URL;
  try {
    url = new URL(input.DATABASE_URL ?? '');
  } catch {
    return { ok: false, reason: 'DATABASE_URL falta o no es una URL' };
  }
  const dbHost = url.hostname;
  const dbName = decodeURIComponent(url.pathname.slice(1));
  if (!LOCAL_DB_HOSTS.has(dbHost)) return { ok: false, reason: `la BD no es local (host ${dbHost})` };
  if (dbName === '') return { ok: false, reason: 'DATABASE_URL no nombra la BD' };
  if (dbName.endsWith('_test')) return { ok: false, reason: `${dbName} es la BD de tests` };
  return { ok: true, dbHost, dbName };
}
