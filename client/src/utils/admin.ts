import { textProblem } from './validate.js';

// Reglas y textos del panel del admin (contrato del bloque 4). El servidor (zod) es la fuente de verdad; aquí se
// duplican de forma explícita (tests/unit/client-parity.test.ts las compara con las del servidor).

// RN-05, D3: motivo de rechazo.
export const REJECTION_REASON_MAX = 500;
export const reasonProblem = (value: string) => textProblem(value, { min: 1, max: REJECTION_REASON_MAX, multiline: true });

// Búsquedas de las listas (q).
export const ADMIN_QUERY_MAX_LENGTH = 100;

// RN-16: rangos de los parámetros de lectura (limits.ts, READING_SETTINGS_RANGES).
export const READING_SETTINGS_RANGES = {
  waitMinutes: { min: 1, max: 1440, unit: 'minutos' },
  maxBalance: { min: 1, max: 20, unit: 'capítulos' },
  refill: { min: 1, max: 10, unit: 'capítulos' },
} as const;
export type SettingField = keyof typeof READING_SETTINGS_RANGES;

// Los mismos mensajes que el schema del servidor (readingSettingsBody).
export function settingProblem(field: SettingField, raw: string): string | null {
  const range = READING_SETTINGS_RANGES[field];
  const value = raw.trim();
  if (!/^-?\d+$/.test(value)) return 'Debe ser un número entero';
  const number = Number(value);
  if (number < range.min) return `Mínimo ${range.min} ${range.unit}`;
  if (number > range.max) return `Máximo ${range.max} ${range.unit}`;
  return null;
}

// CU-40: acciones y entidades de la tabla de auditoría del plan (audit.service.ts), con su texto en español.
export const AUDIT_ACTIONS = [
  'auth.login_ok',
  'auth.login_fail',
  'auth.logout',
  'user.register',
  'user.update_profile',
  'user.password_change',
  'user.role_change',
  'user.author_grant',
  'user.author_revoke',
  'user.suspend',
  'user.reactivate',
  'comic.create',
  'comic.update',
  'comic.approve',
  'comic.reject',
  'comic.withdraw',
  'chapter.create',
  'chapter.submit',
  'chapter.approve',
  'chapter.reject',
  'chapter.withdraw',
  'comment.delete_own',
  'comment.hide',
  'comment.delete',
  'subscription.start',
  'subscription.renew',
  'subscription.cancel',
  'subscription.resume',
  'subscription.expire',
  'settings.update',
  'content.import',
  'system.seed',
] as const;

export const AUDIT_ENTITY_TYPES = {
  users: 'Usuarios',
  comics: 'Obras',
  chapters: 'Capítulos',
  comments: 'Comentarios',
  subscriptions: 'Suscripciones',
  settings: 'Parámetros',
  tags: 'Etiquetas',
  ads: 'Anuncios',
} as const;
