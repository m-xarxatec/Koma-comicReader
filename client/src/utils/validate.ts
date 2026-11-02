// Validación de formularios en el cliente. zod en el servidor es la fuente de verdad: estas reglas son un
// duplicado EXPLÍCITO de server/src/modules/auth/auth.schema.ts y server/src/utils/password.ts (RN-12), y
// server/src/tests/unit/client-parity.test.ts comprueba que dan el mismo resultado.

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

export function displayNameProblem(value: string): string | null {
  const length = chars(value.trim());
  if (length < DISPLAY_NAME_MIN_CHARS || length > DISPLAY_NAME_MAX_CHARS) {
    return `El nombre debe tener de ${DISPLAY_NAME_MIN_CHARS} a ${DISPLAY_NAME_MAX_CHARS} caracteres`;
  }
  return null;
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
export function passwordConfirmProblem(value: string, values: Readonly<Record<string, string>>): string | null {
  if (value === '') return REQUIRED;
  if (value !== (values['password'] ?? '')) return 'Las contraseñas no coinciden';
  return null;
}

export type Rules = Readonly<Record<string, Rule>>;
export type SubmitOutcome = { ok: true } | { ok: false; message: string; fields?: Record<string, string> };

// Cada <input> tiene su elemento de error con id `<id del input>-error`, ya incluido en su aria-describedby.
function errorElement(input: HTMLInputElement): HTMLElement | null {
  return document.getElementById(`${input.id}-error`);
}

function clearFieldError(input: HTMLInputElement): void {
  input.removeAttribute('aria-invalid');
  const error = errorElement(input);
  if (error) {
    error.textContent = '';
    error.hidden = true;
  }
}

function inputsOf(form: HTMLFormElement): HTMLInputElement[] {
  return [...form.elements].filter((element): element is HTMLInputElement => element instanceof HTMLInputElement && element.name !== '');
}

// Pinta los errores por campo (cliente o `fields` del servidor) con aria-invalid y lleva el foco al primero.
// Devuelve los nombres de campo que no tienen <input> en el formulario.
function showFieldErrors(form: HTMLFormElement, errors: Readonly<Record<string, string>>): string[] {
  const unknown: string[] = [];
  let first: HTMLInputElement | null = null;
  for (const [name, message] of Object.entries(errors)) {
    const input = inputsOf(form).find((candidate) => candidate.name === name);
    const error = input && errorElement(input);
    if (!input || !error) {
      unknown.push(name);
      continue;
    }
    input.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    error.hidden = false;
    first ??= input;
  }
  first?.focus();
  return unknown;
}

function showFormError(form: HTMLFormElement, message: string): void {
  const error = form.querySelector<HTMLElement>('[data-form-error]');
  if (!error) return;
  error.textContent = message; // role="alert": se anuncia al aparecer
  error.hidden = message === '';
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
    if (event.target instanceof HTMLInputElement) clearFieldError(event.target);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit?.disabled) return;
    inputsOf(form).forEach(clearFieldError);
    showFormError(form, '');

    const values = Object.fromEntries(inputsOf(form).map((input) => [input.name, input.value]));
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
        const unknown = showFieldErrors(form, outcome.fields ?? {});
        const extra = unknown.map((name) => outcome.fields?.[name]).filter(Boolean);
        showFormError(form, [outcome.message, ...extra].join(' '));
      }
    } finally {
      if (submit) submit.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
}
