import { z } from 'zod';
import { comicParams } from '../comics/comics.schema.js';

// Entrada de las rutas de lectura (contrato del bloque 2). Los parámetros que no pueden existir dan 404
// (validate con `notFound: ['params']`), no 400.

const MAX_INT = 2_147_483_647; // INTEGER de PostgreSQL
const CHAPTER_NOT_FOUND = 'El capítulo no existe';

// :number en forma canónica (sin ceros a la izquierda, signos ni decimales) y dentro de un INTEGER.
export const chapterParams = comicParams.extend({
  number: z
    .string()
    .regex(/^[1-9]\d{0,9}$/, { error: CHAPTER_NOT_FOUND })
    .transform(Number)
    .pipe(z.number().max(MAX_INT, { error: CHAPTER_NOT_FOUND })),
});
export type ChapterParams = z.infer<typeof chapterParams>;
