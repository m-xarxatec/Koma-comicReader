import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../utils/app-error.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import * as audit from '../audit/audit.service.js';
import * as usersRepository from '../users/users.repository.js';
import type { User } from '../users/users.repository.js';
import { canLogIn, isSessionValid } from './permissions.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';

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

// CU-08. Mismo mensaje exista o no el correo, y mismo tiempo (hash ficticio). La suspensión solo se
// revela a quien conoce la contraseña. El correo intentado va solo en `after`, nunca en entity_id.
export async function login(input: LoginInput, ctx: RequestContext): Promise<SessionResult> {
  const user = await usersRepository.findByEmail(pool, input.email);
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? null);

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
