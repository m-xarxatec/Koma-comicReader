import { ADMIN_PAGE_SIZE } from '../../config/limits.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../utils/app-error.js';
import { initials } from '../../utils/text.js';
import * as audit from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { adminUserChangeProblem, isPremium, type AdminUserChange } from '../auth/permissions.js';
import { escapeLike } from '../comics/comics.repository.js';
import * as usersRepository from './users.repository.js';
import type { User } from './users.repository.js';

// Lo único que sale del servidor sobre un usuario (contrato de la API del bloque 1).
export interface UserDto {
  id: number;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  isAuthor: boolean;
  isPremium: boolean;
  premiumUntil: string | null; // ISO 8601
}

export function toUserDto(user: User, now: Date = new Date()): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isAuthor: user.isAuthor,
    isPremium: isPremium(user, now),
    premiumUntil: user.premiumUntil?.toISOString() ?? null,
  };
}

const ACCOUNT_LABELS = { reader: 'Cuenta de lectura', author: 'Cuenta de autoría', admin: 'Cuenta de administración' } as const;

// Valores de profile.html (CU-23); sendPage los escapa. La fecha va en ISO 8601 y el cliente la formatea.
export function profilePageValues(user: User, now: Date = new Date()): Record<string, string> {
  const dto = toUserDto(user, now);
  const kind = dto.role === 'admin' ? 'admin' : dto.isAuthor ? 'author' : 'reader';
  return {
    displayName: dto.displayName,
    email: dto.email,
    initials: initials(dto.displayName),
    accountLabel: ACCOUNT_LABELS[kind],
    plan: kind === 'admin' ? 'admin' : dto.isPremium ? 'premium' : 'free', // el admin no se hace premium (D18)
    premiumUntil: dto.isPremium ? dto.premiumUntil! : '',
    premiumUntilDate: dto.isPremium ? dto.premiumUntil!.slice(0, 10) : '',
  };
}

// CU-23 · RN-12. Nombre visible del propio usuario. Sin cambio, no escribe ni audita (contrato del bloque 3).
export async function updateProfile(user: User, displayName: string, ctx: RequestContext): Promise<User> {
  return withTransaction(async (client) => {
    const current = await usersRepository.findByIdForUpdate(client, user.id);
    // Las cuentas no se borran: sin fila, la sesión ya no vale.
    if (!current) throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar');
    if (current.displayName === displayName) return current;
    const updated = (await usersRepository.updateDisplayName(client, user.id, displayName))!;
    await audit.record(client, {
      action: 'user.update_profile',
      actorId: user.id,
      entityType: 'users',
      entityId: String(user.id),
      before: { displayName: current.displayName },
      after: { displayName: updated.displayName },
      ...ctx,
    });
    return updated;
  });
}

// --- Bloque 4: gestión de usuarios (CU-35; RN-14, RN-15; contrato del bloque 4) ---

export interface AdminUserDto {
  id: number;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  isAuthor: boolean;
  status: 'active' | 'suspended';
  isPremium: boolean;
  premiumUntil: string | null; // ISO 8601
  createdAt: string;
  isSelf: boolean; // el cliente desactiva sus botones de rol y estado
}

export function toAdminUserDto(user: User, admin: User, now: Date = new Date()): AdminUserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isAuthor: user.isAuthor,
    status: user.status,
    isPremium: isPremium(user, now),
    premiumUntil: user.premiumUntil?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    isSelf: user.id === admin.id,
  };
}

export interface AdminUsersPageDto {
  users: AdminUserDto[];
  page: number;
  pageSize: number;
  total: number;
}

export async function listUsers(
  admin: User,
  query: { q: string; role?: 'user' | 'author' | 'admin' | undefined; status?: 'active' | 'suspended' | undefined; page: number },
): Promise<AdminUsersPageDto> {
  const { total, users } = await usersRepository.search(pool, {
    q: escapeLike(query.q),
    role: query.role ?? null,
    status: query.status ?? null,
    limit: ADMIN_PAGE_SIZE,
    offset: (query.page - 1) * ADMIN_PAGE_SIZE,
  });
  const now = new Date();
  return { users: users.map((user) => toAdminUserDto(user, admin, now)), page: query.page, pageSize: ADMIN_PAGE_SIZE, total };
}

const PROBLEMS = {
  self: () => new AppError(403, 'FORBIDDEN', 'No puedes cambiar tu propio rol ni suspenderte'),
  unchanged: () => new AppError(409, 'CONFLICT', 'La cuenta ya tiene ese valor'),
  admin_author: () => new AppError(409, 'CONFLICT', 'Un admin no puede ser autor; quita antes el rol de autor'),
  last_admin: () => new AppError(409, 'CONFLICT', 'Debe quedar al menos un admin activo'),
} as const;

// Un cambio por petición (D6), con su acción de auditoría. Se bloquean primero los admins activos (en orden de id) y
// luego la cuenta: dos admins que se quitan el rol a la vez no dejan la plataforma sin admins (RN-14). Rol y estado
// incrementan token_version y cierran sus sesiones (RN-15, D8); el de autor, no.
export async function changeUser(admin: User, targetId: number, change: AdminUserChange, ctx: RequestContext): Promise<AdminUserDto> {
  return withTransaction(async (client) => {
    const activeAdminIds = await usersRepository.lockActiveAdminIds(client);
    const target = await usersRepository.findByIdForUpdate(client, targetId);
    if (!target) throw new AppError(404, 'NOT_FOUND', 'El usuario no existe');
    const problem = adminUserChangeProblem(admin, target, change, activeAdminIds);
    if (problem) throw PROBLEMS[problem]();

    const base = { actorId: admin.id, entityType: 'users', entityId: String(target.id), ...ctx };
    let updated: User;
    if ('role' in change) {
      updated = await usersRepository.updateRole(client, target.id, change.role);
      await audit.record(client, { ...base, action: 'user.role_change', before: { role: target.role }, after: { role: change.role } });
    } else if ('isAuthor' in change) {
      updated = await usersRepository.updateIsAuthor(client, target.id, change.isAuthor);
      await audit.record(client, {
        ...base,
        action: change.isAuthor ? 'user.author_grant' : 'user.author_revoke',
        before: { isAuthor: target.isAuthor },
        after: { isAuthor: change.isAuthor },
      });
    } else {
      updated = (await usersRepository.updateStatus(client, target.id, change.status))!;
      await audit.record(client, {
        ...base,
        action: change.status === 'suspended' ? 'user.suspend' : 'user.reactivate',
        before: { status: target.status },
        after: { status: change.status },
      });
    }
    return toAdminUserDto(updated, admin);
  });
}
