import { randomUUID } from 'node:crypto';
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

// Hash de una contraseña aleatoria con el mismo coste: se compara contra él cuando el correo no existe,
// para que el login tarde lo mismo exista o no la cuenta. Se calcula al cargar el módulo: si se calculara
// en el primer uso, el primer login con un correo inexistente tardaría el doble y lo delataría.
const dummyHash = hashPassword(randomUUID());
// Si fallara, lo recibe quien lo espera (verifyPassword → 500); sin esto sería un unhandledRejection al arrancar.
dummyHash.catch(() => {});

// Compara con el hash guardado o, si no hay cuenta (null), con el ficticio; en ese caso siempre es false.
export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? (await dummyHash));
  return hash !== null && matches;
}
