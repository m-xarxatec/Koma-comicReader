import { z } from 'zod';
import { COMMENT_BODY_MAX } from '../../config/limits.js';
import { textField } from '../../utils/text.js';
import { chapterParams, routeInteger } from '../reading/reading.schema.js';

// Entrada de la API de comentarios (contrato del bloque 3; RN-11). Una viñeta o un comentario que no pueden
// existir dan 404 (validate con `notFound: ['params']`), no 400.

// /api/comics/:slug/chapters/:number/panels/:position/comments
export const panelParams = chapterParams.extend({ position: routeInteger('La viñeta no existe') });
export type PanelParams = z.infer<typeof panelParams>;

export const commentsQuery = z.object({
  page: z.coerce
    .number({ error: 'La página debe ser un número' })
    .int({ error: 'La página debe ser un número entero' })
    .min(1, { error: 'La primera página es la 1' })
    .default(1),
});
export type CommentsQuery = z.infer<typeof commentsQuery>;

// RN-11: de 1 a 500 caracteres (puntos de código, como el CHECK de la BD), con saltos de línea.
export const commentBody = z.object({ body: textField({ min: 1, max: COMMENT_BODY_MAX, multiline: true }) });
export type CommentInput = z.infer<typeof commentBody>;

// /api/comments/:id
export const commentParams = z.object({ id: routeInteger('El comentario no existe') });
export type CommentParams = z.infer<typeof commentParams>;
