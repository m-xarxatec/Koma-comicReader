import { api } from './api.js';

// Sesión: todas las peticiones pasan por api.ts. El JWT viaja en una cookie httpOnly que JavaScript no ve;
// el estado de la sesión se consulta siempre con GET /api/me.

// Duplicado explícito del contrato (UserDto en server/src/modules/users/users.service.ts).
export interface UserDto {
  id: number;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  isAuthor: boolean;
  isPremium: boolean;
  premiumUntil: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  displayName: string;
}

export const getMe = () => api.get<{ user: UserDto | null }>('/api/me');
export const login = (input: LoginInput) => api.post<{ user: UserDto }>('/api/auth/login', input);
// Solo los campos del contrato, aunque `input` traiga más (p. ej. "Repite la contraseña", que no sale del cliente).
export const register = ({ email, password, displayName }: RegisterInput) =>
  api.post<{ user: UserDto }>('/api/auth/register', { email, password, displayName });
export const logout = () => api.post<void>('/api/auth/logout');
