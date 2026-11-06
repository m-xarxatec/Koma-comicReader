import { z } from 'zod';
import { PASSWORD_MAX_BYTES, passwordProblem } from '../../utils/password.js';
import { controlProblem } from '../../utils/text.js';

// RN-12. zod es la fuente de verdad; el cliente duplica estas constantes de forma explícita.
export const EMAIL_MAX_CHARS = 254;
export const DISPLAY_NAME_MIN_CHARS = 3;
export const DISPLAY_NAME_MAX_CHARS = 30;

const required = { error: 'Este campo es obligatorio' };

// Se guarda y se compara sin espacios y en minúsculas.
const email = z
  .string(required)
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'Introduce un correo válido' })
      .max(EMAIL_MAX_CHARS, { error: `El correo no puede pasar de ${EMAIL_MAX_CHARS} caracteres` }),
  );

// Caracteres contados como puntos de código, igual que la contraseña (RN-12). El perfil (PATCH /api/me)
// usa la misma regla que el registro (contrato del bloque 3). Sin caracteres de control (regla común de textos,
// utils/text.ts): \u0000 no cabe en un TEXT de PostgreSQL y los demás no se ven.
export const displayName = z
  .string(required)
  .trim()
  .superRefine((value, ctx) => {
    const length = [...value].length;
    const problem =
      length < DISPLAY_NAME_MIN_CHARS || length > DISPLAY_NAME_MAX_CHARS
        ? `El nombre debe tener de ${DISPLAY_NAME_MIN_CHARS} a ${DISPLAY_NAME_MAX_CHARS} caracteres`
        : controlProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

// Registro: la regla completa de RN-12, en su única función del servidor.
const newPassword = z.string(required).superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
});

// Login: sin mínimo (la regla puede cambiar), pero nunca más de 72 bytes (bcrypt ignoraría el resto).
const currentPassword = z
  .string(required)
  .min(1, required)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES, {
    error: `No puede pasar de ${PASSWORD_MAX_BYTES} bytes`,
  });

export const registerBody = z.object({ email, password: newPassword, displayName });
export const loginBody = z.object({ email, password: currentPassword });
// Cambio de contraseña (CU-23, D12): la actual, como en el login; la nueva, con la regla del registro.
export const passwordBody = z.object({ currentPassword, newPassword });

export type RegisterInput = z.infer<typeof registerBody>;
export type LoginInput = z.infer<typeof loginBody>;
export type PasswordInput = z.infer<typeof passwordBody>;
