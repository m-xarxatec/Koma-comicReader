// ÚNICO archivo con las reglas de permisos (docs/plan_mvp.md, "Modelo de permisos"). Funciones puras:
// reciben el usuario leído de la BD en esta petición, nunca solo lo que dice el JWT.
// El frontend solo oculta botones; quien decide es el servidor con estas funciones.

import { AD_CHAPTER, FREE_CHAPTERS } from '../../config/limits.js';

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

// Qué exige leer un capítulo a quien lo consulta (contrato del bloque 2, `access`; RN-01, RN-02 y la tabla del
// "Modelo de permisos"). Solo para obras y capítulos aprobados y no retirados: eso se comprueba antes.
// - free: caps. 1–2, ya leído, premium, admin o el autor dueño de la obra ("sus propias obras, sin límite").
// - ad: invitado, cap. 3, tras un anuncio.
// - account: invitado, cap. 4 en adelante (401 e invitación a registrarse).
// - balance: registrado sin premium (también un autor en obra ajena): la primera lectura gasta 1 de saldo.
export type ChapterAccess = 'free' | 'ad' | 'account' | 'balance';

export interface ChapterAccessInput {
  number: number;
  alreadyRead: boolean; // fila en chapter_reads; false para el invitado
  ownsComic: boolean; // comics.author_id es este usuario; false para el invitado
}

export function chapterAccess(user: PermissionSubject | null, chapter: ChapterAccessInput, now: Date): ChapterAccess {
  if (chapter.number <= FREE_CHAPTERS) return 'free';
  if (user === null) return chapter.number === AD_CHAPTER ? 'ad' : 'account';
  if (isAdmin(user) || isPremium(user, now) || chapter.ownsComic || chapter.alreadyRead) return 'free';
  return 'balance';
}
