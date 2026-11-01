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

// Capa `schema`: valida body, params y query con zod → 400 VALIDATION_ERROR con `fields`.
// Lo validado va a res.locals.validated (en Express 5, req.query es de solo lectura).
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const validated: Express.Locals['validated'] = {};
    for (const part of ['body', 'params', 'query'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Revisa los datos enviados', { fields: toFields(result.error) });
      }
      validated[part] = result.data;
    }
    res.locals.validated = validated;
    next();
  };
}
