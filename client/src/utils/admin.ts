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
type AuditEntityType = keyof typeof AUDIT_ENTITY_TYPES;

const isAuditEntityType = (value: string): value is AuditEntityType => Object.hasOwn(AUDIT_ENTITY_TYPES, value);

// CU-40: la entidad de una entrada con su texto en español y su id («Obras #12»). Una entidad desconocida se muestra
// tal cual: el servidor solo audita las de la lista (AuditEntityType), pero el cliente no lo da por hecho.
export function auditEntityLabel(entityType: string, entityId: string | null): string {
  const label = isAuditEntityType(entityType) ? AUDIT_ENTITY_TYPES[entityType] : entityType;
  return entityId ? `${label} #${entityId}` : label;
}

// Listas paginadas (comentarios, usuarios y auditoría): la última página que existe con ese total. Si la pedida ya
// no existe (se vació la última tras una acción o cambió el total), la lista vuelve a pedir esta.
export const lastPage = (total: number, pageSize: number): number => Math.max(1, Math.ceil(total / pageSize));

// CU-32, RN-17: una obra +18 no se aprueba (el servidor responde 409); solo se rechaza con motivo. Un capítulo
// suyo sí se puede aprobar con la obra en pending (D2 del bloque 4): la regla es de la obra.
export const canApprove = (comic: { readonly isAdult: boolean }, chapter: object | null): boolean => chapter !== null || !comic.isAdult;
