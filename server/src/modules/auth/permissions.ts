// ÚNICO archivo con las reglas de permisos (docs/plan_mvp.md, "Modelo de permisos"). Funciones puras:
// reciben el usuario leído de la BD en esta petición, nunca solo lo que dice el JWT.
// El frontend solo oculta botones; quien decide es el servidor con estas funciones.

export interface PermissionSubject {
  role: 'user' | 'admin';
  isAuthor: boolean;
  status: 'active' | 'suspended';
  tokenVersion: number;
  premiumUntil: Date | null;
}

export function isAdmin(user: PermissionSubject): boolean {
  return user.role === 'admin';
}

// Un admin nunca es autor (también lo impide el CHECK users_admin_not_author).
export function isAuthor(user: PermissionSubject): boolean {
  return user.role === 'user' && user.isAuthor;
}

// Es premium si el periodo pagado termina después de ahora.
export function isPremium(user: PermissionSubject, now: Date): boolean {
  return user.premiumUntil !== null && user.premiumUntil.getTime() > now.getTime();
}

// Una sesión vale si la cuenta existe, está activa y el JWT lleva su token_version actual (RN-15).
export function isSessionValid(user: PermissionSubject | null, tokenVersion: number): user is PermissionSubject {
  return user !== null && user.status === 'active' && user.tokenVersion === tokenVersion;
}

// Para iniciar sesión, la cuenta debe estar activa (si no, ACCOUNT_SUSPENDED).
export function canLogIn(user: PermissionSubject): boolean {
  return user.status === 'active';
}
