import { z } from 'zod';
import { ADMIN_QUERY_MAX_LENGTH, AUDIT_ENTITY_ID_MAX, READING_SETTINGS_RANGES, REJECTION_REASON_MAX } from '../../config/limits.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/audit.service.js';
import { textField } from '../../utils/text.js';
import { routeInteger } from '../reading/reading.schema.js';

// Entrada de la API del admin (contrato del bloque 4). zod es la fuente de verdad; el cliente duplica las
// constantes de forma explícita. Los parámetros de ruta reutilizan los de obras, capítulos y comentarios.

// Rechazar obra o capítulo (RN-05, D3): motivo obligatorio, de 1 a 500 caracteres, con saltos de línea.
export const rejectBody = z.object({ reason: textField({ min: 1, max: REJECTION_REASON_MAX, multiline: true }) });
export type RejectInput = z.infer<typeof rejectBody>;

// --- Listas del admin: q y page comunes (contrato del bloque 4, "Comunes") ---

// Un parámetro repetido llega como array y da 400. Sin el carácter nulo: PostgreSQL no lo admite (sería un 500).
export const searchQuery = z
  .string({ error: 'La búsqueda debe ser un único texto' })
  .trim()
  .max(ADMIN_QUERY_MAX_LENGTH, { error: `La búsqueda no puede pasar de ${ADMIN_QUERY_MAX_LENGTH} caracteres` })
  .refine((value) => !value.includes('\u0000'), { error: 'La búsqueda contiene caracteres no válidos' })
  .default('');

export const pageQuery = z.coerce
  .number({ error: 'La página debe ser un número' })
  .int({ error: 'La página debe ser un número entero' })
  .min(1, { error: 'La primera página es la 1' })
  .default(1);

// Un filtro de lista cerrada; sin él, todos.
const oneOf = <T extends readonly [string, ...string[]]>(values: T, label: string) =>
  z.enum(values, { error: `${label} no válido` }).optional();

// --- Moderación (CU-33; RN-11) ---

export const adminCommentsQuery = z.object({
  q: searchQuery,
  status: oneOf(['visible', 'hidden'] as const, 'Estado'),
  page: pageQuery,
});
export type AdminCommentsQuery = z.infer<typeof adminCommentsQuery>;

// --- Usuarios (CU-35; RN-14, RN-15) ---

export const adminUsersQuery = z.object({
  q: searchQuery,
  role: oneOf(['user', 'author', 'admin'] as const, 'Rol'),
  status: oneOf(['active', 'suspended'] as const, 'Estado'),
  page: pageQuery,
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuery>;

// D6: exactamente uno de role, isAuthor o status por petición (una acción, una entrada de auditoría).
export const adminUserBody = z
  .strictObject(
    {
      role: z.enum(['user', 'admin'], { error: 'Rol no válido' }).optional(),
      isAuthor: z.boolean({ error: 'Debe ser verdadero o falso' }).optional(),
      status: z.enum(['active', 'suspended'], { error: 'Estado no válido' }).optional(),
    },
    { error: 'Solo se puede cambiar role, isAuthor o status' },
  )
  .refine((body) => Object.values(body).filter((value) => value !== undefined).length === 1, {
    error: 'Cambia exactamente uno: role, isAuthor o status',
  });
export type AdminUserInput = z.infer<typeof adminUserBody>;

export const userParams = z.object({ id: routeInteger('El usuario no existe') });
export type UserParams = z.infer<typeof userParams>;

// --- Parámetros de lectura (CU-36; RN-16) ---

const ranged = (range: { min: number; max: number }, unit: string) =>
  z
    .number({ error: 'Debe ser un número entero' })
    .int({ error: 'Debe ser un número entero' })
    .min(range.min, { error: `Mínimo ${range.min} ${unit}` })
    .max(range.max, { error: `Máximo ${range.max} ${unit}` });

export const readingSettingsBody = z.strictObject(
  {
    waitMinutes: ranged(READING_SETTINGS_RANGES.waitMinutes, 'minutos'),
    maxBalance: ranged(READING_SETTINGS_RANGES.maxBalance, 'capítulos'),
    refill: ranged(READING_SETTINGS_RANGES.refill, 'capítulos'),
  },
  { error: 'Solo se pueden cambiar waitMinutes, maxBalance y refill' },
);
export type ReadingSettingsInput = z.infer<typeof readingSettingsBody>;

// --- Auditoría (CU-40, D9) ---

const isoDay = z.iso.date({ error: 'Fecha no válida (AAAA-MM-DD)' }).optional();

export const auditQuery = z
  .object({
    // Correo exacto del actor, sin distinguir mayúsculas (D9).
    actor: z.email({ error: 'Correo no válido' }).trim().toLowerCase().max(254).optional(),
    action: z.enum(AUDIT_ACTIONS, { error: 'Acción no válida' }).optional(),
    entityType: z.enum(AUDIT_ENTITY_TYPES, { error: 'Entidad no válida' }).optional(),
    entityId: z
      .string({ error: 'El id debe ser un único texto' })
      .trim()
      .min(1, { error: 'El id no puede estar vacío' })
      .max(AUDIT_ENTITY_ID_MAX, { error: `El id no puede pasar de ${AUDIT_ENTITY_ID_MAX} caracteres` })
      .refine((value) => !value.includes('\u0000'), { error: 'El id contiene caracteres no válidos' })
      .optional(),
    from: isoDay,
    to: isoDay,
    page: pageQuery,
  })
  .refine((query) => query.entityId === undefined || query.entityType !== undefined, {
    error: 'El id va siempre con su entidad',
    path: ['entityId'],
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    error: '«Desde» no puede ser posterior a «Hasta»',
    path: ['to'],
  });
export type AuditQueryInput = z.infer<typeof auditQuery>;
