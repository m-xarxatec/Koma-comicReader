import { IMAGE_TOO_LARGE, MAX_IMAGE_BYTES, textProblem } from './validate.js';

// Reglas de /comunidad (contrato del bloque 6; RN-22). El servidor (zod) es la fuente de verdad: aquí se duplican de
// forma explícita config/limits.ts, modules/illustrations/illustrations.rules.ts e illustrations.schema.ts, y
// tests/unit/client-illustrations.test.ts comprueba que dan el mismo resultado. Funciones puras, sin DOM.

export const ILLUSTRATION_TITLE_MAX = 100;
export const ILLUSTRATION_DESCRIPTION_MAX = 500;
export const ILLUSTRATION_TAGS_MAX = 5; // de 0 a 5
export const ILLUSTRATION_TAG_MIN = 2; // caracteres de cada etiqueta, ya normalizada
export const ILLUSTRATION_TAG_MAX = 30;
export const ILLUSTRATION_PENDING_MAX = 5; // pendientes de revisión por usuario (D5)
export const ILLUSTRATIONS_PAGE_SIZE = 24;

// RN-10: los tres formatos que admite el servidor (él los comprueba por la firma del archivo, no por este tipo).
const IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

// La regla del slug de RN-09 (toSlug del servidor): minúsculas, sin acentos, guiones.
function toSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Etiquetas escritas en un solo texto, separadas por comas (D3): normalizadas, sin vacías ni repetidas, en su orden.
export function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map(toSlug).filter((tag) => tag !== ''))];
}

// Mismos mensajes que tagsProblem del servidor. Recibe las etiquetas ya normalizadas.
export function tagsProblem(tags: readonly string[]): string | null {
  if (tags.length > ILLUSTRATION_TAGS_MAX) return `Puedes poner como mucho ${ILLUSTRATION_TAGS_MAX} etiquetas`;
  if (tags.some((tag) => tag.length < ILLUSTRATION_TAG_MIN || tag.length > ILLUSTRATION_TAG_MAX)) {
    return `Cada etiqueta debe tener entre ${ILLUSTRATION_TAG_MIN} y ${ILLUSTRATION_TAG_MAX} caracteres`;
  }
  return null;
}

// D6: título obligatorio y descripción opcional, con la regla común de textos.
export const illustrationTitleProblem = (value: string) => textProblem(value, { min: 1, max: ILLUSTRATION_TITLE_MAX });
export const illustrationDescriptionProblem = (value: string) =>
  textProblem(value, { min: 0, max: ILLUSTRATION_DESCRIPTION_MAX, multiline: true });
export const illustrationTagsProblem = (value: string) => tagsProblem(parseTags(value));

// Aviso temprano: el servidor vuelve a comprobar el tamaño (413) y la firma del archivo (415).
export function imageProblem(file: { size: number; type: string } | null): string | null {
  if (!file || file.size === 0) return 'Elige una imagen';
  // Sin tipo (un .webp en algunos Windows): decide el servidor por la firma del archivo (RN-10).
  if (file.type !== '' && !IMAGE_TYPES.includes(file.type)) return 'La imagen debe ser JPEG, PNG o WebP';
  if (file.size > MAX_IMAGE_BYTES) return IMAGE_TOO_LARGE;
  return null;
}

// --- Tablero: su estado vive en la URL (/comunidad?tag=…&page=…) ---

export interface BoardState {
  tag: string | null;
  page: number;
}

// El patrón del slug del servidor (SLUG_PATTERN de comics.schema.ts), con los límites de una etiqueta.
const TAG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PAGE_PATTERN = /^[1-9]\d{0,8}$/;

// Lo que el servidor rechazaría con 400 se descarta aquí: el tablero se abre sin filtro o en la primera página.
export function readBoardState(search: URLSearchParams): BoardState {
  const tag = search.get('tag') ?? '';
  const page = search.get('page') ?? '';
  const validTag = TAG_PATTERN.test(tag) && tag.length >= ILLUSTRATION_TAG_MIN && tag.length <= ILLUSTRATION_TAG_MAX;
  return { tag: validTag ? tag : null, page: PAGE_PATTERN.test(page) ? Number(page) : 1 };
}

// Consulta del tablero, para la API y para los enlaces de la página: sin los valores por defecto.
export function boardQueryString(state: BoardState): string {
  const params = new URLSearchParams();
  if (state.tag) params.set('tag', state.tag);
  if (state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

export const pageCount = (total: number, pageSize: number) => Math.ceil(total / pageSize);

// Qué muestra la paginación del tablero y de «Mis ilustraciones»: nada con una sola página; más allá de la última
// (un enlace antiguo, o ?page=3 sin resultados), solo la vuelta a la última que existe o a la 1; si no, la completa.
export type PaginationView = { kind: 'hidden' } | { kind: 'back'; to: number } | { kind: 'full'; page: number; pages: number };
export function paginationView(page: number, pages: number): PaginationView {
  if (pages <= 1 && page <= 1) return { kind: 'hidden' };
  if (page > pages) return { kind: 'back', to: Math.max(pages, 1) };
  return { kind: 'full', page, pages };
}
