import { ILLUSTRATION_TAG_MAX, ILLUSTRATION_TAG_MIN, ILLUSTRATION_TAGS_MAX } from '../../config/limits.js';
import { toSlug } from '../comics/comics.rules.js';

// Reglas puras de las ilustraciones de la comunidad (RN-22; contrato del bloque 6, D3), sin BD ni reloj.

// Etiquetas libres escritas en un solo texto, separadas por comas: cada una se normaliza con la regla del slug de
// RN-09 (minúsculas, sin acentos, guiones); las vacías y las repetidas tras normalizar se descartan. Conserva el
// orden en que se escribieron.
export function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map(toSlug).filter((tag) => tag !== ''))];
}

// null = válidas. Recibe las etiquetas ya normalizadas: de 0 a 5, de 2 a 30 caracteres cada una.
export function tagsProblem(tags: readonly string[]): string | null {
  if (tags.length > ILLUSTRATION_TAGS_MAX) return `Puedes poner como mucho ${ILLUSTRATION_TAGS_MAX} etiquetas`;
  if (tags.some((tag) => tag.length < ILLUSTRATION_TAG_MIN || tag.length > ILLUSTRATION_TAG_MAX)) {
    return `Cada etiqueta debe tener entre ${ILLUSTRATION_TAG_MIN} y ${ILLUSTRATION_TAG_MAX} caracteres`;
  }
  return null;
}
