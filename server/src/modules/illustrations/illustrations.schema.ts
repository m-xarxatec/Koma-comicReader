import { z } from 'zod';
import { ILLUSTRATION_DESCRIPTION_MAX, ILLUSTRATION_TAG_MAX, ILLUSTRATION_TAG_MIN, ILLUSTRATION_TITLE_MAX } from '../../config/limits.js';
import { textField } from '../../utils/text.js';
import { pageQuery } from '../admin/admin.schema.js';
import { SLUG_PATTERN } from '../comics/comics.schema.js';
import { routeInteger } from '../reading/reading.schema.js';
import { parseTags, tagsProblem } from './illustrations.rules.js';

// Entrada de la API de ilustraciones (contrato del bloque 6; RN-22). zod es la fuente de verdad; el cliente duplica
// las constantes de forma explícita.

// GET /api/illustrations: `tag` filtra por una sola etiqueta, ya normalizada (un parámetro repetido llega como array
// y da 400; el patrón del slug deja fuera el carácter nulo, que PostgreSQL no admite).
export const boardQuery = z.object({
  tag: z
    .string({ error: 'La etiqueta debe ser un único texto' })
    .regex(SLUG_PATTERN, { error: 'Etiqueta no válida' })
    .min(ILLUSTRATION_TAG_MIN, { error: 'Etiqueta no válida' })
    .max(ILLUSTRATION_TAG_MAX, { error: 'Etiqueta no válida' })
    .optional(),
  page: pageQuery,
});
export type BoardQuery = z.infer<typeof boardQuery>;

// GET /api/me/illustrations
export const ownQuery = z.object({ page: pageQuery });
export type OwnQuery = z.infer<typeof ownQuery>;

// POST /api/illustrations: los campos de texto del multipart (multer los deja en req.body como textos). Título
// obligatorio y descripción opcional (D6), con la regla común de textos; la descripción vacía se guarda como null.
// Las etiquetas llegan en un solo texto, separadas por comas (D3).
export const illustrationBody = z.object({
  title: textField({ min: 1, max: ILLUSTRATION_TITLE_MAX }),
  description: textField({ min: 0, max: ILLUSTRATION_DESCRIPTION_MAX, multiline: true })
    .optional()
    .transform((value) => (value ? value : null)),
  tags: z
    .string({ error: 'Las etiquetas deben ir en un único texto, separadas por comas' })
    .optional()
    .transform((value) => parseTags(value ?? ''))
    .superRefine((tags, ctx) => {
      const problem = tagsProblem(tags);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    }),
});
export type IllustrationInput = z.infer<typeof illustrationBody>;

// :id de una ilustración. Uno que no puede existir es 404 (validate con `notFound: ['params']`), no 400.
export const illustrationParams = z.object({ id: routeInteger('La ilustración no existe') });
export type IllustrationParams = z.infer<typeof illustrationParams>;

// GET /api/admin/illustrations (D9): pendientes (por defecto) o publicadas.
export const adminIllustrationsQuery = z.object({
  status: z.enum(['pending', 'approved'], { error: 'Estado no válido' }).default('pending'),
  page: pageQuery,
});
export type AdminIllustrationsQuery = z.infer<typeof adminIllustrationsQuery>;
