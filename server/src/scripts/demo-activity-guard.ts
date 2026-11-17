// Guarda de la actividad simulada (idea 24; docs/plan_mvp.md, «Pulido» → «Actividad simulada para la demo», D14–D21).
// Pura y sin `env`: el test unitario la importa sin .env (tests/unit/demo-activity-guard.test.ts).
//
// PARA QUIEN AMPLÍE ESTO (léelo antes de tocar nada):
// - Esta guarda es lo único que impide que el script actúe donde no debe. No la relajes para «probar una cosa»:
//   añade primero el caso al test y luego cambia el código.
// - `demo:activity` (local): APP_URL con http y un host de LOCAL_HOSTS. `demo:activity:online`: https, un host que
//   no sea local y `--confirm <host>` escrito a mano por el desarrollador, igual al host de APP_URL.
// - El script solo usa cuentas `@demo.test` (isDemoEmail). Si añades cuentas, que sigan en ese dominio: así se
//   reconocen en /admin y se pueden retirar después de la demo (D21).
// - El motivo de un rechazo se imprime en la terminal: nunca metas en él la contraseña ni la URL con credenciales.

export interface ActivityTargetInput {
  mode: 'local' | 'online'; // lo fija el comando de package.json (`--online`), no el entorno
  appUrl?: string | undefined; // APP_URL
  confirm?: string | undefined; // valor de --confirm
  password?: string | undefined; // SEED_READER_PASSWORD (D17)
}

export type ActivityTarget = { ok: true; origin: string; host: string } | { ok: false; reason: string };

// Hosts de la demo local (plan: localhost, 127.0.0.1 o koma.local). Comparación exacta: «localhost.evil.example» no vale.
export const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', 'koma.local']);

// RN-12: la contraseña de una cuenta tiene al menos 10 caracteres; con menos, el registro daría 400 en cada cuenta.
const MIN_PASSWORD_LENGTH = 10;

const DEMO_EMAIL = /^[^@\s]+@demo\.test$/;

export const isDemoEmail = (email: string): boolean => DEMO_EMAIL.test(email);

export function checkActivityTarget(input: ActivityTargetInput): ActivityTarget {
  let url: URL;
  try {
    url = new URL(input.appUrl ?? '');
  } catch {
    return { ok: false, reason: 'APP_URL falta o no es una URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'APP_URL debe ser http o https' };
  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'APP_URL no puede llevar usuario ni contraseña' };

  const host = url.hostname;
  const isLocalHost = LOCAL_HOSTS.has(host);
  if (input.mode === 'local') {
    if (url.protocol !== 'http:') return { ok: false, reason: 'demo:activity solo actúa sobre http (la demo local); para online, demo:activity:online' };
    if (!isLocalHost) return { ok: false, reason: 'el host de APP_URL no es local (' + host + '): usa localhost, 127.0.0.1 o koma.local' };
    if (input.confirm !== undefined) return { ok: false, reason: '--confirm es solo para demo:activity:online' };
  } else {
    if (isLocalHost) return { ok: false, reason: 'demo:activity:online no actúa sobre un host local (' + host + '): usa demo:activity' };
    if (url.protocol !== 'https:') return { ok: false, reason: 'demo:activity:online exige https en APP_URL' };
    if (input.confirm !== host) return { ok: false, reason: 'falta --confirm ' + host + ' (tiene que ser igual al host de APP_URL)' };
  }

  if ([...(input.password ?? '')].length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: 'SEED_READER_PASSWORD falta o tiene menos de ' + MIN_PASSWORD_LENGTH + ' caracteres' };
  }
  return { ok: true, origin: url.origin, host };
}
