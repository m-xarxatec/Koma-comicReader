// Validación del parámetro `next` (vuelta tras el login). Función pura: la usan las rutas y sus tests.
//
// Solo se acepta una ruta local: empieza por `/` y no por `//` ni `/\` (el navegador trata `\` como `/`,
// así que `/\evil.com` es `//evil.com`, otro sitio). Tampoco admite caracteres de control: el navegador
// elimina tabuladores y saltos de línea de las URL, de modo que `/\t/evil.com` también acabaría en `//evil.com`.
const LOCAL_PATH = /^\/(?![/\\])/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export const DEFAULT_NEXT = '/';

export function isSafeNext(value: unknown): value is string {
  return typeof value === 'string' && LOCAL_PATH.test(value) && !CONTROL_CHARS.test(value);
}

// Devuelve `next` si es seguro y, si no, la página de inicio.
export function safeNext(value: unknown): string {
  return isSafeNext(value) ? value : DEFAULT_NEXT;
}
