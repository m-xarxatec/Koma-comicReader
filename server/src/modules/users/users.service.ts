import { withTransaction } from '../../db/pool.js';
import { AppError } from '../../utils/app-error.js';
import { initials } from '../../utils/text.js';
import * as audit from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { isPremium } from '../auth/permissions.js';
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
    plan: dto.isPremium ? 'premium' : 'free',
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
