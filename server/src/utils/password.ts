import bcrypt from 'bcrypt';

// RN-12: de 10 caracteres a 72 bytes. bcrypt ignora lo que pase de 72 bytes: se mide con Buffer.byteLength.
export const PASSWORD_MIN_CHARS = 10;
export const PASSWORD_MAX_BYTES = 72;
export const BCRYPT_ROUNDS = 12;

// Única fuente de RN-12 en el servidor (el schema de registro la reutiliza; el cliente la duplica de forma
// explícita en utils/validate.ts). Cuenta puntos de código, no unidades UTF-16 como `z.string().min()` o
// `minlength`. Función pura (sin `env`): la usan el seed, el registro y sus tests. null = válida.
export function passwordProblem(password: string): string | null {
  if ([...password].length < PASSWORD_MIN_CHARS) return `Debe tener al menos ${PASSWORD_MIN_CHARS} caracteres`;
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return `No puede pasar de ${PASSWORD_MAX_BYTES} bytes`;
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// El hash ficticio del login (mismo tiempo exista o no la cuenta) vive en auth.service.ts: necesita el logger,
// y este archivo no puede cargar `env` (lo importan el seed y los tests unitarios, que corren sin variables).
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
