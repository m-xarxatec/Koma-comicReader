import { z } from 'zod';
import {
  AUTHOR_CREDIT_MAX,
  CATALOG_MAX_TAGS,
  CATALOG_QUERY_MAX_LENGTH,
  COMIC_SYNOPSIS_MAX,
  COMIC_TAGS_MAX,
  COMIC_TITLE_MAX,
  CONTENT_WARNING_MAX,
} from '../../config/limits.js';
import { textField } from '../../utils/text.js';
import { LICENSE_CODES } from './comics.rules.js';

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

// :slug de las rutas de una obra. Uno que no cumple el patrón no puede existir: 404 (validate con
// `notFound: ['params']`), no 400; y nunca llega a la BD (un %00 sería un 500 de PostgreSQL).
export const comicParams = z.object({
  slug: z.string().regex(SLUG_PATTERN, { error: 'La obra no existe' }),
});
export type ComicParams = z.infer<typeof comicParams>;

// --- Obras del autor (contrato del bloque 3; RN-05, RN-07, RN-17; D5, D6) ---

// POST /api/author/comics (CU-28). Textos con la regla común (utils/text.ts). Las etiquetas repetidas cuentan
// una vez; que existan y que haya al menos un género lo comprueba el servicio (400 en fields.tags).
export const createComicBody = z.object({
  title: textField({ min: 1, max: COMIC_TITLE_MAX }),
  synopsis: textField({ min: 1, max: COMIC_SYNOPSIS_MAX, multiline: true }),
  authorCredit: textField({ min: 1, max: AUTHOR_CREDIT_MAX }),
  license: z.enum(LICENSE_CODES, { error: 'Elige una licencia de la lista' }),
  tags: z
    .array(z.string({ error: 'Etiqueta no válida' }).regex(SLUG_PATTERN, { error: 'Etiqueta no válida' }), {
      error: 'Elige al menos una etiqueta',
    })
    .min(1, { error: 'Elige al menos una etiqueta' })
    .max(COMIC_TAGS_MAX, { error: `Puedes elegir como mucho ${COMIC_TAGS_MAX} etiquetas` })
    .transform((tags) => [...new Set(tags)]),
  // RN-08: null = sin advertencia. Un texto vacío no vale (el formulario envía null si no se marca la casilla).
  contentWarning: textField({ min: 1, max: CONTENT_WARNING_MAX }).nullable(),
  isAdult: z.boolean({ error: 'Indica si la obra es para mayores de 18 años' }), // RN-17
  // RN-07 y CU-28: obligatoria; false o ausente → 400.
  authorshipDeclared: z.literal(true, { error: 'Debes declarar que eres el autor de la obra o que tienes permiso para publicarla' }),
});
export type CreateComicInput = z.infer<typeof createComicBody>;

// PATCH /api/author/comics/:slug (CU-30, recortable): los campos del alta, todos opcionales, salvo la declaración de
// autoría (ya se hizo al crearla; si llega, se ignora). El slug no se edita nunca (RN-09).
export const updateComicBody = createComicBody.omit({ authorshipDeclared: true }).partial();
export type UpdateComicInput = z.infer<typeof updateComicBody>;
