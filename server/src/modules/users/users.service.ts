import { isPremium } from '../auth/permissions.js';
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
