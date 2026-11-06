import { z } from 'zod';

// Regla común de los textos que escribe el usuario (contrato del bloque 3): sin espacios en los extremos,
// longitud en puntos de código (como RN-12 y el char_length de la BD, no en unidades UTF-16) y sin caracteres
// de control, salvo el salto de línea en los textos de varias líneas. Función pura: la usan los schemas de zod
// y sus tests; el cliente la duplica de forma explícita.

export interface TextRule {
  min: number;
  max: number;
  multiline?: boolean; // sinopsis y comentarios
}

// \r\n y \r se guardan como \n; después se recortan los extremos.
export function normalizeText(value: string, multiline = false): string {
  return (multiline ? value.replace(/\r\n?/g, '\n') : value).trim();
}

// Cc = caracteres de control (incluye \u0000, que PostgreSQL no admite en un texto).
const CONTROL = /\p{Cc}/u;
const CONTROL_EXCEPT_NEWLINE = /[^\P{Cc}\n]/u;

// Solo la parte de los caracteres de control: la usa también el nombre visible (RN-12), que conserva su propio
// mensaje de longitud. null = válido.
export function controlProblem(value: string, multiline = false): string | null {
  return (multiline ? CONTROL_EXCEPT_NEWLINE : CONTROL).test(value) ? 'Contiene caracteres no válidos' : null;
}

// null = válido. Recibe el texto ya normalizado.
export function textProblem(value: string, rule: TextRule): string | null {
  const length = [...value].length;
  if (length < rule.min) return rule.min === 1 ? 'Este campo es obligatorio' : `Debe tener al menos ${rule.min} caracteres`;
  if (length > rule.max) return `No puede pasar de ${rule.max} caracteres`;
  return controlProblem(value, rule.multiline);
}

// Campo de zod con la regla: normaliza y valida (el valor validado es el normalizado).
export function textField(rule: TextRule) {
  return z
    .string({ error: 'Este campo es obligatorio' })
    .transform((value) => normalizeText(value, rule.multiline))
    .superRefine((value, ctx) => {
      const problem = textProblem(value, rule);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    });
}

// Iniciales decorativas del avatar del perfil (D17): la primera letra de las dos primeras palabras, en mayúsculas.
// Puntos de código, no unidades UTF-16 (un emoji no se parte). client/src/utils/validate.ts la duplica.
export function initials(displayName: string): string {
  return displayName
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]!.toLocaleUpperCase('es'))
    .join('');
}
