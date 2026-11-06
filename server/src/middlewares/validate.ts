import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/app-error.js';

// Respaldo para mensajes que un schema no personalice (los de los campos van escritos en cada schema).
z.config(z.locales.es());

declare global {
  namespace Express {
    interface Locals {
      validated: { body?: unknown; params?: unknown; query?: unknown }; // lo deja `validate`
    }
  }
}

type Part = 'body' | 'params' | 'query';
type Schemas = Partial<Record<Part, z.ZodType>>;

export interface ValidateOptions {
  // Partes cuyo fallo significa "no existe" (404 NOT_FOUND con el primer mensaje del schema) en vez de 400:
  // parámetros de ruta que no pueden corresponder a ningún recurso (slug o número no válidos).
  notFound?: readonly Part[];
}

// Primer mensaje de cada campo, para pintarlo junto a su <input> (`fields` del error 400).
function toFields(error: z.ZodError): Record<string, string> {
  const { formErrors, fieldErrors } = z.flattenError(error);
  const fields: Record<string, string> = {};
  for (const [field, messages] of Object.entries(fieldErrors) as [string, string[] | undefined][]) {
    if (messages?.[0]) fields[field] = messages[0];
  }
  if (formErrors[0]) fields['_form'] = formErrors[0];
  return fields;
}

// Capa `schema`: valida body, params y query con zod → 400 VALIDATION_ERROR con `fields` (o 404, ver
// ValidateOptions). Lo validado va a res.locals.validated (en Express 5, req.query es de solo lectura). Se acumula:
// una ruta puede validar los params antes de requireAuthor (404 antes que 401) y el cuerpo después.
export function validate(schemas: Schemas, options: ValidateOptions = {}): RequestHandler {
  return (req, res, next) => {
    const validated: Express.Locals['validated'] = {};
    // Primero los params: una ruta que no puede existir es 404 aunque el cuerpo tampoco sea válido.
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success && options.notFound?.includes(part)) {
        throw new AppError(404, 'NOT_FOUND', result.error.issues[0]?.message ?? 'La página o el recurso no existe');
      }
      if (!result.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Revisa los datos enviados', { fields: toFields(result.error) });
      }
      validated[part] = result.data;
    }
    res.locals.validated = { ...res.locals.validated, ...validated };
    next();
  };
}
