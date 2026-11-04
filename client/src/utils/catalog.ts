// Estas constantes duplican explícitamente el contrato de GET /api/comics.
export const CATALOG_QUERY_MAX_LENGTH = 100;
export const CATALOG_MAX_TAGS = 10;
export const CATALOG_PAGE_SIZE = 24;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function queryProblem(q: string): string | null {
  const value = q.trim();
  // Como zod 4 en el servidor: cuenta puntos de código, no unidades UTF-16 (un emoji cuenta 1, no 2).
  if (Array.from(value).length > CATALOG_QUERY_MAX_LENGTH) return `La búsqueda no puede pasar de ${CATALOG_QUERY_MAX_LENGTH} caracteres`;
  if (value.includes('\u0000')) return 'La búsqueda contiene caracteres no válidos';
  return null;
}

export function tagsProblem(tags: string): string | null {
  if (tags === '') return null;
  const unique = new Set(tags.split(','));
  if ([...unique].some((slug) => !SLUG_PATTERN.test(slug))) return 'Etiqueta no válida';
  if (unique.size > CATALOG_MAX_TAGS) return `Puedes combinar como mucho ${CATALOG_MAX_TAGS} etiquetas`;
  return null;
}

export function readCatalogState(search: URLSearchParams): { q: string; tags: string[]; page: number } {
  const q = (search.get('q') ?? '').trim();
  const tagValues = search.getAll('tags');
  const tags = tagValues.length === 0 || (tagValues.length === 1 && tagValues[0] === '')
    ? []
    : [...new Set(tagValues.flatMap((value) => value.split(',')))];
  const pageValue = Number(search.get('page') ?? '1');
  const page = Number.isSafeInteger(pageValue) && pageValue >= 1 ? pageValue : 1;
  return { q, tags, page };
}

export function catalogQueryString(state: { q: string; tags: readonly string[]; page: number }): string {
  const query = new URLSearchParams();
  if (state.q) query.set('q', state.q);
  if (state.tags.length > 0) query.set('tags', state.tags.join(','));
  if (state.page !== 1) query.set('page', String(state.page));
  const value = query.toString();
  return value ? `?${value}` : '';
}
