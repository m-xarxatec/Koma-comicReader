import { SLUG_MAX_LENGTH } from '../../config/limits.js';

// Reglas puras de las obras del autor (sin BD ni reloj): slug (RN-09), licencias (RN-07, D6) y sumas del panel del
// autor (RN-19).

// RN-09: slug del título al crear la obra. Minúsculas, sin acentos (NFD sin marcas diacríticas), cada tramo que
// no sea [a-z0-9] pasa a un guion, sin guiones en los extremos y con SLUG_MAX_LENGTH caracteres como mucho. Si
// queda vacío (un título solo con signos o en otro alfabeto), `obra`. Cumple el CHECK de comics.slug.
export function slugify(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
  return base === '' ? 'obra' : base;
}

// RN-09: si el slug ya existe (también el de una obra retirada, que conserva su URL con 410), `-2`, `-3`…
// `taken` son los slugs ocupados que empiezan por la base (comics.repository.ts).
export function nextFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// D6: lista cerrada, sin licencias NC (la plataforma vende suscripción). La URL la pone el servidor: el autor
// nunca escribe un enlace que la ficha pinte como href. En comics.license se guarda el nombre visible, el mismo
// formato que las obras importadas.
export const LICENSES = {
  'all-rights-reserved': { name: 'Todos los derechos reservados', url: null },
  'cc-by-4.0': { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/deed.es' },
  'cc-by-sa-4.0': { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.es' },
  'cc0-1.0': { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.es' },
} as const satisfies Record<string, { name: string; url: string | null }>;

export type LicenseCode = keyof typeof LICENSES;
export const LICENSE_CODES = Object.keys(LICENSES) as [LicenseCode, ...LicenseCode[]];

// Del nombre guardado al código del contrato. null = una licencia fuera de la lista (obra importada).
export function licenseCodeFromName(name: string): LicenseCode | null {
  return LICENSE_CODES.find((code) => LICENSES[code].name === name) ?? null;
}

// --- RN-19: panel del autor ---

export interface Reads {
  total: number;
  last7: number;
  last30: number;
}

export interface WorkReads<C> {
  comic: C;
  reads: Reads;
  chapters: { number: number; title: string; reads: Reads }[];
}

const ZERO: Reads = { total: 0, last7: 0, last30: 0 };
export const addReads = (a: Reads, b: Reads): Reads => ({ total: a.total + b.total, last7: a.last7 + b.last7, last30: a.last30 + b.last30 });

// Agrupa las filas (una por obra y capítulo approved vivo; `chapter` null si la obra no tiene ninguno) en obras con
// sus capítulos, en el orden en que llegan. La obra suma sus capítulos (así coincide siempre con ellos) y el total
// suma las obras. Una obra sin capítulos ni lecturas queda con ceros.
export function groupWorkReads<C extends { id: number }>(
  rows: readonly { comic: C; chapter: { number: number; title: string; reads: Reads } | null }[],
): { reads: Reads; works: WorkReads<C>[] } {
  const works = new Map<number, WorkReads<C>>();
  for (const { comic, chapter } of rows) {
    const work = works.get(comic.id) ?? { comic, reads: ZERO, chapters: [] };
    works.set(comic.id, work);
    if (chapter) {
      work.chapters.push(chapter);
      work.reads = addReads(work.reads, chapter.reads);
    }
  }
  const list = [...works.values()];
  return { reads: list.reduce((sum, work) => addReads(sum, work.reads), ZERO), works: list };
}
