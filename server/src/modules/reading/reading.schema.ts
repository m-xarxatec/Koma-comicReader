import { z } from 'zod';
import { MAX_PANELS_PER_CHAPTER, PG_MAX_INT } from '../../config/limits.js';
import { comicParams } from '../comics/comics.schema.js';

// Entrada de las rutas de lectura (contrato del bloque 2). Los parámetros que no pueden existir dan 404
// (validate con `notFound: ['params']`), no 400.

const CHAPTER_NOT_FOUND = 'El capítulo no existe';

// Entero de ruta en forma canónica (sin ceros a la izquierda, signos ni decimales) y dentro de un INTEGER:
// número de capítulo, posición de viñeta o id. Fuera de esa forma no puede existir: 404 con `message`.
export function routeInteger(message: string) {
  return z
    .string()
    .regex(/^[1-9]\d{0,9}$/, { error: message })
    .transform(Number)
    .pipe(z.number().max(PG_MAX_INT, { error: message }));
}

const chapterNumber = routeInteger(CHAPTER_NOT_FOUND);

// API: /api/comics/:slug/chapters/:number/read
export const chapterParams = comicParams.extend({ number: chapterNumber });
export type ChapterParams = z.infer<typeof chapterParams>;

// Página: /leer/:slug/:numero (las URLs de páginas van en español).
export const readerPageParams = comicParams.extend({ numero: chapterNumber });
export type ReaderPageParams = z.infer<typeof readerPageParams>;

// Progreso de lectura (RN-21; contrato del bloque 5): la viñeta máxima alcanzada. El tope del capítulo concreto lo
// comprueba el servicio (400 en fields.panel); aquí, la forma y el máximo de viñetas de RN-10.
export const progressBody = z.object({
  panel: z
    .int({ error: 'Indica la viñeta con un número entero' })
    .min(1, { error: 'La viñeta empieza en 1' })
    .max(MAX_PANELS_PER_CHAPTER, { error: 'La viñeta no existe en este capítulo' }),
});
export type ProgressInput = z.infer<typeof progressBody>;
