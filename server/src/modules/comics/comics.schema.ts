import { z } from 'zod';
import { CATALOG_MAX_TAGS, CATALOG_QUERY_MAX_LENGTH } from '../../config/limits.js';

// Entrada de la API de obras (contrato del bloque 2). zod es la fuente de verdad; el cliente duplica estas
// constantes de forma explícita.

// Slug de obra y de etiqueta (el mismo CHECK en la BD).
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// GET /api/comics: un parámetro repetido llega como array y da 400 (no es un único texto).
export const catalogQuery = z.object({
  // Busca en el título y en el autor (author_credit).
  q: z
    .string({ error: 'La búsqueda debe ser un único texto' })
    .trim()
    .max(CATALOG_QUERY_MAX_LENGTH, { error: `La búsqueda no puede pasar de ${CATALOG_QUERY_MAX_LENGTH} caracteres` })
    // PostgreSQL no admite el carácter nulo en un texto: sin esto, ?q=%00 sería un 500.
    .refine((value) => !value.includes('\u0000'), { error: 'La búsqueda contiene caracteres no válidos' })
    .default(''),
  // Slugs separados por comas, combinados con Y; los repetidos cuentan una vez.
  tags: z
    .string({ error: 'Las etiquetas deben ir en un único texto, separadas por comas' })
    .transform((value) => (value === '' ? [] : [...new Set(value.split(','))]))
    .pipe(
      z
        .array(z.string().regex(SLUG_PATTERN, { error: 'Etiqueta no válida' }))
        .max(CATALOG_MAX_TAGS, { error: `Puedes combinar como mucho ${CATALOG_MAX_TAGS} etiquetas` }),
    )
    .default([]),
  page: z.coerce
    .number({ error: 'La página debe ser un número' })
    .int({ error: 'La página debe ser un número entero' })
    .min(1, { error: 'La primera página es la 1' })
    .default(1),
});
export type CatalogQuery = z.infer<typeof catalogQuery>;
