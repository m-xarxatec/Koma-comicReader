import type { Queryable } from '../../db/pool.js';
import { AppError, INTERNAL_ERROR_MESSAGE } from '../../utils/app-error.js';
import * as auditRepository from './audit.repository.js';

// Nombres exactos de la tabla de auditoría de docs/plan_mvp.md ("Registro de auditoría y reversión").
export type AuditAction =
  | 'auth.login_ok'
  | 'auth.login_fail'
  | 'auth.logout'
  | 'user.register'
  | 'user.update_profile'
  | 'user.password_change'
  | 'user.role_change'
  | 'user.author_grant'
  | 'user.author_revoke'
  | 'user.suspend'
  | 'user.reactivate'
  | 'comic.create'
  | 'comic.update'
  | 'comic.approve'
  | 'comic.reject'
  | 'comic.withdraw'
  | 'chapter.create'
  | 'chapter.submit'
  | 'chapter.approve'
  | 'chapter.reject'
  | 'chapter.withdraw'
  | 'comment.delete_own'
  | 'comment.hide'
  | 'comment.delete'
  | 'subscription.start'
  | 'subscription.renew'
  | 'subscription.cancel'
  | 'subscription.resume' // aprobada el 8-nov (contrato del bloque 4, D14)
  | 'subscription.expire'
  | 'settings.update'
  | 'content.import'
  | 'system.seed';

export interface AuditEntry {
  action: AuditAction;
  actorId: number | null; // NULL = invitado o sistema
  entityType: string; // nombre de la tabla
  entityId: string | null;
  before?: object | null; // solo los campos cambiados
  after?: object | null;
  ip: string | null;
  requestId: string;
}

// Nunca contraseñas, hashes, tokens ni datos de pago en before/after (CLAUDE.md, "Seguridad obligatoria").
// No se descarta en silencio: es un fallo de programación, se lanza un AppError 500 con el mensaje genérico
// (el campo culpable va en `cause`, que solo llega al log) y la transacción del cambio se deshace entera.
// Ojo: el fragmento `token` también atrapa `token_version`; si algún día hubiera que auditarlo, se renombra
// el campo en before/after (p. ej. `sessionVersion`), no se relaja el filtro.
const FORBIDDEN_KEY = /pass|hash|token|secret|card|cvc|iban/i;

function findForbiddenKey(value: unknown, path: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEY.test(key)) return childPath;
    const nested = findForbiddenKey(child, childPath);
    if (nested) return nested;
  }
  return null;
}

// Se llama con el mismo `client` que el cambio auditado, dentro de su withTransaction.
export async function record(db: Queryable, entry: AuditEntry): Promise<void> {
  const before = entry.before ?? null;
  const after = entry.after ?? null;
  const forbidden = findForbiddenKey(before, 'before') ?? findForbiddenKey(after, 'after');
  if (forbidden) {
    throw new AppError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE, {
      cause: new Error(`Auditoría ${entry.action}: el campo ${forbidden} no puede guardarse`),
    });
  }
  await auditRepository.insert(db, { ...entry, before, after });
}
