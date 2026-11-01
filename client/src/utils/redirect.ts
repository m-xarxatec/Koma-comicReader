// Duplicado EXPLÍCITO de server/src/utils/redirect.ts (safeNext); server/src/tests/unit/client-parity.test.ts
// comprueba que dan el mismo resultado. Solo se acepta una ruta local: empieza por `/` y no por `//` ni `/\`
// (el navegador trata `\` como `/`), y sin caracteres de control (el navegador los elimina de la URL).
const LOCAL_PATH = /^\/(?![/\\])/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export const DEFAULT_NEXT = '/';

export function safeNext(value: unknown): string {
  return typeof value === 'string' && LOCAL_PATH.test(value) && !CONTROL_CHARS.test(value) ? value : DEFAULT_NEXT;
}
