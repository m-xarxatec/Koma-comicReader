import { z } from 'zod';
import { CHAPTER_TITLE_MAX, PG_MAX_INT } from '../../config/limits.js';
import { textField } from '../../utils/text.js';
import { chapterParams, routeInteger } from '../reading/reading.schema.js';

// Entrada de las rutas del autor para capítulos y viñetas (contrato del bloque 3; CU-29, CU-30). Los parámetros
// que no pueden existir dan 404 (validate con `notFound: ['params']`), no 400.

// /api/author/comics/:slug/chapters/:number
export const authorChapterParams = chapterParams;
export type AuthorChapterParams = z.infer<typeof authorChapterParams>;

// /api/author/comics/:slug/chapters/:number/panels/:position
export const authorPanelParams = chapterParams.extend({ position: routeInteger('La viñeta no existe') });
export type AuthorPanelParams = z.infer<typeof authorPanelParams>;

// Entero del cuerpo dentro de un INTEGER de PostgreSQL (fuera de rango sería un 500 de la BD).
const bodyInteger = (label: string) =>
  z
    .number({ error: `${label} debe ser un número entero` })
    .int({ error: `${label} debe ser un número entero` })
    .min(1, { error: `${label} empieza en 1` })
    .max(PG_MAX_INT, { error: `${label} es demasiado grande` });

// CU-29 (D21, D22): el número lo elige el autor; el título, si falta, es "Capítulo N" (solo al crearlo).
export const createChapterBody = z.object({
  number: bodyInteger('El número de capítulo'),
  title: textField({ min: 1, max: CHAPTER_TITLE_MAX }).optional(),
});
export type CreateChapterInput = z.infer<typeof createChapterBody>;

// RN-05 (D9): la posición nueva de la viñeta. Que esté entre 1 y el número de viñetas lo comprueba el servicio.
export const movePanelBody = z.object({ position: bodyInteger('La posición') });
export type MovePanelInput = z.infer<typeof movePanelBody>;
