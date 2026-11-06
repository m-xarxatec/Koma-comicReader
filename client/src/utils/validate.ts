// Validación de formularios en el cliente. zod en el servidor es la fuente de verdad: estas reglas son un
// duplicado EXPLÍCITO de server/src/modules/auth/auth.schema.ts, server/src/utils/password.ts (RN-12),
// server/src/utils/text.ts y server/src/config/limits.ts (textos del bloque 3), y
// server/src/tests/unit/client-parity.test.ts comprueba que dan el mismo resultado.

import type { ApiError } from '../services/api.js';

export const EMAIL_MAX_CHARS = 254;
export const DISPLAY_NAME_MIN_CHARS = 3;
export const DISPLAY_NAME_MAX_CHARS = 30;
export const PASSWORD_MIN_CHARS = 10;
export const PASSWORD_MAX_BYTES = 72;

// z.regexes.email de zod 4.6.7 (la que usa z.email() en el servidor).
const EMAIL = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

const REQUIRED = 'Este campo es obligatorio';
const encoder = new TextEncoder();
const chars = (value: string) => [...value].length; // puntos de código, como el servidor

// Una regla devuelve el mensaje de error o null si el valor es válido. Recibe también el resto de valores
// del formulario, para las que comparan dos campos (repetir la contraseña).
export type Rule = (value: string, values: Readonly<Record<string, string>>) => string | null;

// Como el servidor: sin espacios en los extremos y en minúsculas.
export function emailProblem(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email === '') return REQUIRED;
  if (!EMAIL.test(email)) return 'Introduce un correo válido';
  if (email.length > EMAIL_MAX_CHARS) return `El correo no puede pasar de ${EMAIL_MAX_CHARS} caracteres`;
  return null;
}

// RN-12 y la regla común de textos: sin caracteres de control (controlProblem, más abajo).
export function displayNameProblem(value: string): string | null {
  const name = value.trim();
  const length = chars(name);
  if (length < DISPLAY_NAME_MIN_CHARS || length > DISPLAY_NAME_MAX_CHARS) {
    return `El nombre debe tener de ${DISPLAY_NAME_MIN_CHARS} a ${DISPLAY_NAME_MAX_CHARS} caracteres`;
  }
  return controlProblem(name);
}

// RN-12, mismos mensajes que passwordProblem del servidor.
export function passwordProblem(value: string): string | null {
  if (chars(value) < PASSWORD_MIN_CHARS) return `Debe tener al menos ${PASSWORD_MIN_CHARS} caracteres`;
  if (encoder.encode(value).length > PASSWORD_MAX_BYTES) return `No puede pasar de ${PASSWORD_MAX_BYTES} bytes`;
  return null;
}

// Login: sin mínimo (como el servidor), pero nunca más de 72 bytes.
export function currentPasswordProblem(value: string): string | null {
  if (value === '') return REQUIRED;
  if (encoder.encode(value).length > PASSWORD_MAX_BYTES) return `No puede pasar de ${PASSWORD_MAX_BYTES} bytes`;
  return null;
}

// Solo en el cliente: "Repite la contraseña" no se envía a la API ni forma parte del contrato (RN-12).
// `field` es el campo con el que debe coincidir: `password` en el registro, `newPassword` en el perfil.
export function confirmationOf(field: string): Rule {
  return (value, values) => {
    if (value === '') return REQUIRED;
    if (value !== (values[field] ?? '')) return 'Las contraseñas no coinciden';
    return null;
  };
}

export const passwordConfirmProblem = confirmationOf('password');

// --- Textos del bloque 3 (server/src/utils/text.ts y config/limits.ts) ---

export const COMMENT_BODY_MAX = 500;

export interface TextRule {
  min: number;
  max: number;
  multiline?: boolean; // sinopsis y comentarios
}

// \r\n y \r cuentan como \n; sin espacios en los extremos.
export function normalizeText(value: string, multiline = false): string {
  return (multiline ? value.replace(/\r\n?/g, '\n') : value).trim();
}

const CONTROL = /\p{Cc}/u;
const CONTROL_EXCEPT_NEWLINE = /[^\P{Cc}\n]/u;

// Mismo mensaje que controlProblem del servidor. Recibe el valor ya normalizado.
export function controlProblem(value: string, multiline = false): string | null {
  return (multiline ? CONTROL_EXCEPT_NEWLINE : CONTROL).test(value) ? 'Contiene caracteres no válidos' : null;
}

// Mismos mensajes que textProblem del servidor. Recibe el valor sin normalizar.
export function textProblem(raw: string, rule: TextRule): string | null {
  const value = normalizeText(raw, rule.multiline);
  const length = chars(value);
  if (length < rule.min) return rule.min === 1 ? REQUIRED : `Debe tener al menos ${rule.min} caracteres`;
  if (length > rule.max) return `No puede pasar de ${rule.max} caracteres`;
  return controlProblem(value, rule.multiline);
}

// RN-11: de 1 a 500 caracteres, con saltos de línea.
export const commentProblem = (value: string) => textProblem(value, { min: 1, max: COMMENT_BODY_MAX, multiline: true });

// D17: iniciales decorativas del avatar del perfil. Mismo resultado que initials() de server/src/utils/text.ts.
export function initials(displayName: string): string {
  return displayName
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]!.toLocaleUpperCase('es'))
    .join('');
}

// Contador del campo: los caracteres que contará el servidor (puntos de código, ya normalizado).
export const textLength = (value: string, multiline = false) => chars(normalizeText(value, multiline));

export type Rules = Readonly<Record<string, Rule>>;
export type SubmitOutcome = { ok: true } | { ok: false; message: string; fields?: Record<string, string> };

const timeFormat = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

// Resultado de un envío que la API rechazó: su mensaje y sus `fields`. Con 429 se añade la hora a la que se
// puede volver a intentar y, si el fallo es del servidor o de la red, el código de referencia de los logs.
export function failureOutcome(status: number, error: ApiError): SubmitOutcome {
  let message = error.message;
  if (error.code === 'RATE_LIMITED' && error.retryAt) {
    message += ` Podrás volver a intentarlo a las ${timeFormat.format(new Date(error.retryAt))}.`;
  }
  if ((status === 0 || status >= 500) && error.requestId) message += ` Código de referencia: ${error.requestId}.`;
  return { ok: false, message, ...(error.fields && { fields: error.fields }) };
}

// Campos con nombre de un formulario: <input>, <textarea> y <select>.
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const isField = (element: unknown): element is Field =>
  element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;

// Valor que ven las reglas y onSubmit: una casilla vale su `value` si está marcada y '' si no; un grupo de
// radios, el valor del marcado.
function fieldValue(field: Field): string {
  if (field instanceof HTMLInputElement && field.type === 'radio') {
    const group = field.form?.elements.namedItem(field.name);
    return group instanceof RadioNodeList ? group.value : field.checked ? field.value : '';
  }
  if (field instanceof HTMLInputElement && field.type === 'checkbox') return field.checked ? field.value : '';
  return field.value;
}

// Cada campo tiene su elemento de error con id `<id del campo>-error`, ya incluido en su aria-describedby.
function errorElement(input: Field): HTMLElement | null {
  return document.getElementById(`${input.id}-error`);
}

function clearFieldError(input: Field): void {
  input.removeAttribute('aria-invalid');
  const error = errorElement(input);
  if (error) {
    error.textContent = '';
    error.hidden = true;
  }
}

// Las casillas con el mismo nombre (etiquetas) cuentan una vez: las lee onSubmit directamente.
function inputsOf(form: HTMLFormElement): Field[] {
  const seen = new Set<string>();
  return [...form.elements].filter((element): element is Field => {
    if (!isField(element) || element.name === '' || seen.has(element.name)) return false;
    seen.add(element.name);
    return true;
  });
}

// Pinta los errores por campo (cliente o `fields` del servidor) con aria-invalid y lleva el foco al primero
// en el orden del formulario, venga como venga el orden de `errors`. Devuelve los nombres de campo que no
// tienen <input> (o su elemento de error) en el formulario.
function showFieldErrors(form: HTMLFormElement, errors: Readonly<Record<string, string>>): string[] {
  const shown = new Set<string>();
  let first: Field | null = null;
  for (const input of inputsOf(form)) {
    const message = Object.hasOwn(errors, input.name) ? errors[input.name] : undefined;
    const error = errorElement(input);
    if (message === undefined || !error) continue;
    input.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    error.hidden = false;
    shown.add(input.name);
    first ??= input;
  }
  first?.focus();
  return Object.keys(errors).filter((name) => !shown.has(name));
}

// `focus`: tras un error sin campos (429, 500, red…), el foco va al mensaje. Si no, se quedaría en el botón,
// que está desactivado durante el envío, y el navegador lo dejaría en <body>.
function showFormError(form: HTMLFormElement, message: string, focus = false): void {
  const error = form.querySelector<HTMLElement>('[data-form-error]');
  if (!error) return;
  error.textContent = message; // role="alert": se anuncia al aparecer
  error.hidden = message === '';
  if (focus && !error.hidden) {
    error.tabIndex = -1; // enfocable por código, fuera del orden del tabulador
    error.focus();
  }
}

// Valida con `rules` al enviar, desactiva el botón durante el envío y pinta los errores del servidor
// (`fields` junto a cada campo; el resto, en el aviso del formulario). Sin JS el formulario no llega aquí.
export function bindForm(
  form: HTMLFormElement,
  rules: Rules,
  onSubmit: (values: Record<string, string>) => Promise<SubmitOutcome>,
): void {
  form.noValidate = true; // mensajes propios y accesibles en lugar de las burbujas del navegador
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  form.addEventListener('input', (event) => {
    if (isField(event.target)) clearFieldError(event.target);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit?.disabled) return;
    inputsOf(form).forEach(clearFieldError);
    showFormError(form, '');

    const values = Object.fromEntries(inputsOf(form).map((input) => [input.name, fieldValue(input)]));
    const errors: Record<string, string> = {};
    for (const [name, rule] of Object.entries(rules)) {
      const problem = rule(values[name] ?? '', values);
      if (problem) errors[name] = problem;
    }
    if (Object.keys(errors).length > 0) {
      showFieldErrors(form, errors);
      return;
    }

    if (submit) submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    try {
      const outcome = await onSubmit(values);
      if (!outcome.ok) {
        const fields = outcome.fields ?? {};
        const unknown = showFieldErrors(form, fields);
        const extra = unknown.map((name) => fields[name]).filter(Boolean);
        // Si ningún campo recibió su error (y el foco), el foco va al mensaje del formulario.
        showFormError(form, [outcome.message, ...extra].join(' '), unknown.length === Object.keys(fields).length);
      }
    } finally {
      if (submit) submit.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
}
