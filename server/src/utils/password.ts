import bcrypt from 'bcrypt';

// RN-12: de 10 caracteres a 72 bytes. bcrypt ignora lo que pase de 72 bytes: se mide con Buffer.byteLength.
export const PASSWORD_MIN_CHARS = 10;
export const PASSWORD_MAX_BYTES = 72;
export const BCRYPT_ROUNDS = 12;

// Función pura (sin `env`): la usan el seed, el registro y sus tests. null = válida.
export function passwordProblem(password: string): string | null {
  if ([...password].length < PASSWORD_MIN_CHARS) return `Debe tener al menos ${PASSWORD_MIN_CHARS} caracteres`;
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return `No puede pasar de ${PASSWORD_MAX_BYTES} bytes`;
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
