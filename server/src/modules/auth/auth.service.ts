import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../utils/app-error.js';
import { logger } from '../../utils/logger.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import * as audit from '../audit/audit.service.js';
import * as usersRepository from '../users/users.repository.js';
import type { User } from '../users/users.repository.js';
import { canLogIn, isSessionValid } from './permissions.js';
import type { LoginInput, PasswordInput, RegisterInput } from './auth.schema.js';

// Sesión: JWT HS256 { sub: id, tv: token_version } en la cookie koma_session, 7 días, sin renovación.
export const SESSION_TTL_DAYS = 7;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const JWT_ALGORITHM = 'HS256';

export interface RequestContext {
  ip: string | null;
  requestId: string;
}

export interface SessionResult {
  user: User;
  token: string;
}

export function signSession(user: Pick<User, 'id' | 'tokenVersion'>): string {
  return jwt.sign({ tv: user.tokenVersion }, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    subject: String(user.id),
    expiresIn: Math.floor(SESSION_TTL_MS / 1000),
  });
}

// null si el token no es nuestro, está caducado o no tiene la forma esperada.
export function verifySession(token: string): { userId: number; tokenVersion: number } | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    if (typeof payload !== 'object') return null;
    const userId = Number(payload.sub);
    const tokenVersion = payload['tv'];
    if (!Number.isSafeInteger(userId) || userId <= 0 || typeof tokenVersion !== 'number') return null;
    return { userId, tokenVersion };
  } catch {
    return null;
  }
}

// Usuario de la sesión leído de la BD en esta petición (status y token_version), o null = invitado.
export async function resolveSession(token: string): Promise<User | null> {
  const claims = verifySession(token);
  if (!claims) return null;
  const user = await usersRepository.findById(pool, claims.userId);
  return isSessionValid(user, claims.tokenVersion) ? user : null;
}

// CU-07 · RN-12. El hash se calcula fuera de la transacción; el alta y su auditoría van juntas.
export async function register(input: RegisterInput, ctx: RequestContext): Promise<SessionResult> {
  const passwordHash = await hashPassword(input.password);
  const user = await withTransaction(async (client) => {
    const created = await usersRepository.insert(client, { email: input.email, passwordHash, displayName: input.displayName });
    if (!created) throw new AppError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo');
    await audit.record(client, {
      action: 'user.register',
      actorId: created.id,
      entityType: 'users',
      entityId: String(created.id),
      after: { email: created.email, displayName: created.displayName },
      ...ctx,
    });
    return created;
  });
  return { user, token: signSession(user) };
}

// Hash de una contraseña aleatoria con el mismo coste: se compara contra él cuando el correo no existe,
// para que el login tarde lo mismo exista o no la cuenta. Se calcula al cargar el módulo: si se calculara
// en el primer uso, el primer login con un correo inexistente tardaría el doble y lo delataría.
const dummyHash = hashPassword(randomUUID());
// Un fallo se registra en cuanto ocurre (sin manejador sería un unhandledRejection y el proceso terminaría);
// el login que lo espere recibe el mismo error y responde 500.
dummyHash.catch((err: unknown) => logger.error('No se pudo calcular el hash ficticio del login', { err }));

// CU-08. Mismo mensaje exista o no el correo, y mismo tiempo (hash ficticio). La suspensión solo se
// revela a quien conoce la contraseña. El correo intentado va solo en `after`, nunca en entity_id.
export async function login(input: LoginInput, ctx: RequestContext): Promise<SessionResult> {
  const user = await usersRepository.findByEmail(pool, input.email);
  // Sin cuenta se compara igualmente (contra el ficticio); el resultado no cuenta, porque !user ya falla.
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash));

  if (!user || !passwordOk) {
    await audit.record(pool, {
      action: 'auth.login_fail',
      actorId: null,
      entityType: 'users',
      entityId: user ? String(user.id) : null,
      after: { email: input.email, reason: 'credentials' },
      ...ctx,
    });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos');
  }
  if (!canLogIn(user)) {
    await audit.record(pool, {
      action: 'auth.login_fail',
      actorId: null,
      entityType: 'users',
      entityId: String(user.id),
      after: { email: input.email, reason: 'suspended' },
      ...ctx,
    });
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida');
  }

  await audit.record(pool, { action: 'auth.login_ok', actorId: user.id, entityType: 'users', entityId: String(user.id), ...ctx });
  return { user, token: signSession(user) };
}

// Sin sesión no hay nada que auditar: el logout responde 204 igualmente.
export async function logout(user: User | null, ctx: RequestContext): Promise<void> {
  if (!user) return;
  await audit.record(pool, { action: 'auth.logout', actorId: user.id, entityType: 'users', entityId: String(user.id), ...ctx });
}

// CU-23 · RN-12 · RN-15. La contraseña actual incorrecta es un 400 en su campo (no un 401: la sesión sigue
// valiendo). Los hashes se calculan fuera de la transacción; dentro van el hash nuevo, token_version + 1 y la
// auditoría, sin before ni after. El JWT nuevo lleva el token_version nuevo: las demás sesiones dejan de valer.
export async function changePassword(user: User, input: PasswordInput, ctx: RequestContext): Promise<SessionResult> {
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Revisa los datos enviados', {
      fields: { currentPassword: 'La contraseña actual no es correcta' },
    });
  }
  const passwordHash = await hashPassword(input.newPassword);
  const updated = await withTransaction(async (client) => {
    const changed = await usersRepository.updatePassword(client, user.id, passwordHash, user.tokenVersion);
    // Otra petición invalidó esta sesión mientras se calculaba el hash (otro cambio, una suspensión).
    if (!changed) throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar');
    await audit.record(client, {
      action: 'user.password_change',
      actorId: user.id,
      entityType: 'users',
      entityId: String(user.id),
      ...ctx,
    });
    return changed;
  });
  return { user: updated, token: signSession(updated) };
}
