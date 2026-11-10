import { OG_DESCRIPTION_MAX } from '../config/limits.js';

// Open Graph (CU-06; idea 1; contrato del bloque 5, D8 y D9): valores de las meta og:* de /, /obra/:slug y
// /leer/:slug/:numero. Función pura: recibe APP_URL como parámetro (los tests unitarios no cargan env.ts).
// Los valores salen sin escapar: sendPage los pasa por fillTemplate, que escapa cada uno al inyectarlo.

// Imagen propia de Koma, servida desde /icons (nunca la portada: las imágenes de las obras van con URL firmada
// que caduca). Sus medidas están escritas en og:image:width y og:image:height de las tres plantillas;
// tests/unit/open-graph.test.ts comprueba que coinciden con las del archivo.
export const OG_IMAGE_PATH = '/icons/koma-og.png';

export const HOME_OG_DESCRIPTION = 'Koma: descubre cómics gratuitos, explora historias y comparte tu creatividad.';

// type (no interface): así se puede pasar tal cual a sendPage, que recibe un Record<string, string>.
export type OpenGraphValues = {
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
  ogImage: string;
};

// URL absoluta con el origen de APP_URL y solo la ruta: sin ? ni #.
function absoluteUrl(appUrl: string, path: string): string {
  const url = new URL(path, appUrl);
  url.search = '';
  url.hash = '';
  return url.href;
}

// Sinopsis en una línea: cada salto de línea (con los espacios que lo rodean) pasa a un espacio, y se corta en
// puntos de código (un emoji no se parte en dos unidades UTF-16), con «…» si no cabe.
export function ogSynopsis(synopsis: string): string {
  const oneLine = synopsis.replace(/[ \t]*\r?\n[ \t\r\n]*/g, ' ').trim();
  const points = [...oneLine];
  if (points.length <= OG_DESCRIPTION_MAX) return oneLine;
  return `${points.slice(0, OG_DESCRIPTION_MAX - 1).join('').trimEnd()}…`;
}

function values(appUrl: string, path: string, ogTitle: string, ogDescription: string): OpenGraphValues {
  return { ogTitle, ogDescription, ogUrl: absoluteUrl(appUrl, path), ogImage: absoluteUrl(appUrl, OG_IMAGE_PATH) };
}

export function homeOpenGraph(appUrl: string): OpenGraphValues {
  return values(appUrl, '/', 'Koma', HOME_OG_DESCRIPTION);
}

// slug ya validado con su regex y leído de la BD: no lleva caracteres que haya que codificar.
export function comicOpenGraph(appUrl: string, comic: { slug: string; title: string; synopsis: string }): OpenGraphValues {
  return values(appUrl, `/obra/${comic.slug}`, comic.title, ogSynopsis(comic.synopsis));
}

export function chapterOpenGraph(appUrl: string, comic: { slug: string; title: string }, number: number): OpenGraphValues {
  return values(appUrl, `/leer/${comic.slug}/${number}`, `${comic.title} · Capítulo ${number}`, `Lee el capítulo ${number} de ${comic.title} en Koma.`);
}
