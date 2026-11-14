# Encargo T13 · Página home de Koma (catálogo)

Trabajas en `/home/evilsec/Documentos/portafolio/koma-t13`, un worktree de git (rama `t13-codex`) del proyecto Koma (plataforma de cómics tipo webtoon). Escribes el código del cliente de la página de inicio. Otra IA revisará tu diff contra las reglas del proyecto antes de integrarlo.

**No hay sandbox: solo puedes escribir dentro de `/home/evilsec/Documentos/portafolio/koma-t13`.** Nada fuera de ese directorio (ni el repositorio principal `../ultimo_entregable_xarxa`, ni la maqueta, ni tu configuración).

Lee primero, en este orden: `CLAUDE.md` (reglas obligatorias), `client/public/pages/home.html`, `client/public/pages/auth.html` (ejemplo de página ya integrada), `client/src/pages/auth.ts`, `client/src/services/api.ts`, `client/public/styles/variables.css`, `client/public/styles/layers.css`, `client/public/styles/base.css` y `client/public/styles/components/*.css`.

Maqueta de referencia (SOLO LECTURA, no escribas nada en ella): `/home/evilsec/Descargas/entregable/base_codigo/KOMA_errores_frontend/koma_home/index.html`, con `styles/home.css` y `styles/components/{hero,quick-links,comic-card,genres}.css`. Manda su aspecto (paleta, espaciados, tarjetas, degradados), pero con los nombres de tokens y las clases del proyecto, y con los cambios de este encargo.

## Límites

- Solo puedes crear o modificar:
  - `client/public/pages/home.html`
  - `client/public/styles/components/` (archivos nuevos de la home; no cambies los existentes)
  - `client/public/styles/variables.css` y `client/public/styles/layers.css` (solo AÑADIR tokens o capas; no cambies ni borres los existentes)
  - `client/src/pages/home.ts`
  - `client/src/components/` (archivos nuevos: p. ej. `comic-card.ts`)
  - `client/src/utils/catalog.ts` (nuevo, ver más abajo)
- No toques nada más: ni `server/`, ni `docs/`, ni `CLAUDE.md`, ni `package.json`, ni `tsconfig*`, ni `client/src/services/api.ts`, ni `client/src/components/header.ts`, ni `client/public/icons/`, ni otras páginas.
- No hagas commits, ni push, ni `git add`, ni ningún comando git que escriba. No instales dependencias (no hay red para npm).
- Puedes ejecutar `npm run typecheck` y `npm test` (tests unitarios). No ejecutes `npm run test:api` (necesita una base de datos que aquí no hay).

## Reglas de CLAUDE.md que aplican aquí

- **Plantilla:** `home.html` conserva los marcadores `<!-- @head -->` (dentro de `<head>`), `<!-- @header -->` y `<!-- @footer -->` y `<meta name="request-id" content="{{requestId}}">`. La cabecera, el pie, la navegación móvil y "Saltar al contenido" los pone el servidor (`layout.ts`): no los copies. `lang="es"`, `<title>Koma</title>`, un solo `<h1>`, `<main id="contenido">`, `<link rel="icon" href="/icons/favicon.svg">`. El script, como ahora: `<script type="module" src="/js/pages/home.js"></script>`. Sin scripts en línea ni atributos `on*=` (hay CSP).
- **Hojas de estilo:** enlazadas en `<head>` en este orden: `variables.css`, `layers.css`, `base.css` y después los componentes. Sin `@import`. Un archivo por componente en `client/public/styles/components/`, con clases BEM. CSS mobile-first, con `@media (min-width: 40rem)` y `(min-width: 64rem)`.
- **Tokens:** todo valor visual (colores, tamaños, espacios, radios, sombras, duraciones, degradados) sale de `variables.css`. Si falta uno, añádelo allí con un nombre del proyecto (`--color-…`, `--space-…`, `--radius-…`) y, si es un color, también su valor para el tema claro (mira cómo lo hace `variables.css`). Los `z-index` salen de `layers.css`. Tema oscuro por defecto y claro con `prefers-color-scheme: light`, ya resueltos en `variables.css`. Fuentes del sistema.
- **Accesibilidad:** HTML semántico que se entienda sin JS (`section` con `aria-labelledby`, `nav` con `aria-label`), `:focus-visible`, áreas táctiles de 44 px (`--touch-target`), `aria-live="polite"` para el resultado del catálogo, `aria-busy` mientras carga. Iconos: `<svg class="icon" aria-hidden="true"><use href="/icons/sprite.svg#icon-…"/></svg>`. En el sprite hay: home, compass, search, arrow, refresh, book, users, pencil, cap y spark.
- **Imágenes:** portadas con `width` y `height` (proporción fija, `object-fit: cover` en CSS) y `alt` con el título. `loading="lazy"` en todas MENOS las de la primera pantalla (las 5 de Tendencias van sin lazy).
- **TypeScript:** estricto, ESM, imports relativos con extensión `.js`, sin `any`, sin `as unknown as`, sin `!` innecesarios. Sin `innerHTML`, `outerHTML`, `insertAdjacentHTML` ni `document.write`: los datos de la API se pintan con `textContent` y atributos (`setAttribute`, `href`, `src`), o clonando `<template>` del HTML. Las peticiones, SOLO con `api` de `client/src/services/api.ts` (`ApiResult<T>`: nunca lanza; mira `ok`). Nada de `fetch` directo. Un `store` mínimo por página (un objeto con el estado). Nada en `localStorage`.
- **Textos de interfaz en español.** El nombre de la marca en textos es "Koma" (no "KOMA").

## Contrato de la API (bloque 2)

`GET /api/tags` → 200 `{ tags: TagDto[] }`, géneros primero y por nombre.
`GET /api/comics?q=&tags=&page=` → 200 `{ comics: ComicCardDto[], page, pageSize, total }`, de la más reciente a la más antigua; 400 `VALIDATION_ERROR` con `fields` (`q`, `tags` o `page`).
- `q`: 0–100 caracteres tras quitar espacios de los extremos; busca en título y autor.
- `tags`: slugs separados por comas (`^[a-z0-9]+(-[a-z0-9]+)*$`), combinados con Y, hasta 10 distintos (los repetidos cuentan una vez). Un slug que no existe deja la lista vacía (200).
- `page`: entero ≥ 1; página de 24 obras.

```ts
interface TagDto { slug: string; name: string; type: 'genre' | 'theme' }
interface ComicCardDto {
  slug: string;
  title: string;
  authorCredit: string;
  coverUrl: string | null; // URL firmada (caduca); null si no tiene portada
  tags: TagDto[];
}
interface ApiError { code: string; message: string; fields?: Record<string, string>; retryAt?: string; requestId: string }
```

La ficha de una obra es `/obra/<slug>`.

## Decisiones aprobadas para la home

- **D9 · `/explorar` no existe.** Todo enlace a "explorar" va a `/#catalogo` o a `/?tags=<slug>#catalogo`.
- **D10 · Tendencias y catálogo.**
  - La sección se titula **"Tendencias"** (`id="tendencias"`) y muestra las 5 primeras obras de la misma petición del catálogo (página 1, sin filtros). Su "Ver todas" baja a `#catalogo`.
  - Con una búsqueda o filtros activos (`q` o `tags`), o en una página distinta de la 1, Tendencias se oculta.
  - Debajo de los géneros va `#catalogo` (`<section id="catalogo">` con su `h2`): filtros, rejilla de hasta 24 tarjetas, paginación y estado vacío.
- **D11 · Filtros.** En el mismo `<details class="catalog-filters">` de la maqueta: el campo "Título o autor" (`name="q"`, `maxlength="100"`) y casillas (`checkbox`, `name="tags"`) generadas desde `/api/tags`, agrupadas en dos `fieldset` con `legend` ("Género" y "Temática"), marcadas según la URL. Nada de los `select` de la maqueta ni de sus opciones inventadas.
- **D12 · Mosaico de géneros.** Se genera desde `/api/tags` (solo `type: 'genre'`), cada uno enlazando a `/?tags=<slug>#catalogo`. Sin el texto "ICONO" de la maqueta y sin la casilla "+18".
- **D13 · Hero.** Se conservan el eyebrow, el `h1` ("Lee, crea y comparte historias.", con el resaltado de la maqueta), la descripción y los dos botones: "Explorar cómics" → `#catalogo` y "Unirme a Koma" → `/registro`. La ilustración es un marcador: deja el degradado de la maqueta SIN texto (ni "ILUSTRACIÓN PRINCIPAL" ni "Reemplazar por banner"), `aria-hidden="true"`.
- **D14 · Accesos rápidos y Premium.**
  - Las cuatro tarjetas de accesos rápidos son visibles. "Leer" enlaza a `#catalogo`. "Crear", "Comunidad" y "Tutoriales" aún no tienen página: van SIN enlace (no son `<a>` ni enfocables) y con una marca visible "Próximamente".
  - El banner Premium de la maqueta NO entra (llega en el bloque 4).
- **D15 · Paginación y estado vacío** (la maqueta no los tiene; usa sus botones y tokens).
  - Paginación: `<nav aria-label="Paginación">` con "Anterior" y "Siguiente" y el texto "Página N de M" (M = ceil(total / 24)). Son enlaces reales (`<a href="/?q=…&tags=…&page=N#catalogo">`); en la primera o la última página, el que no aplica no es un enlace.
  - Estado vacío: un mensaje ("No hay obras que coincidan con tu búsqueda", o "Todavía no hay obras publicadas" sin filtros) y el enlace "Ver todo el catálogo" (`/#catalogo`).

## Comportamiento

- El estado del catálogo vive en la URL de `/`: `q`, `tags` y `page`. El formulario de filtros es `method="get"` con `action="/"` y navega (recarga la página); los enlaces de paginación y de géneros también. `home.ts` lee `location.search` al cargar. Acepta `tags` repetido (lo que envía el formulario de casillas, `tags=a&tags=b`) o separado por comas, y para la API y los enlaces que genere usa siempre la forma con comas. No uses `history.pushState`.
- El buscador de la cabecera ya envía `?q=` a `/`: la home debe mostrar ese resultado.
- Al cargar: pide `/api/tags` y `/api/comics` (con la query normalizada). Mientras cargan, `aria-busy="true"` en la región del catálogo. Si la query de la URL no es válida según las reglas de arriba, no llames a la API con ella: muestra el mensaje en el catálogo, con un enlace a `/#catalogo`. Si la API responde error (`ok: false`), muestra `error.message` y un botón "Reintentar" que repite la petición. Sin red (`NETWORK_ERROR`), lo mismo.
- Si la URL trae `#catalogo`, tras pintar los resultados deja el desplazamiento en el catálogo para que se vea (sin robar el foco en la carga normal sin hash).
- Tarjeta (`client/src/components/comic-card.ts`, clase `comic-card` de la maqueta): `<article>` con un enlace a `/obra/<slug>` que envuelve la portada y el cuerpo; título en `<h3>`; meta con los nombres de los géneros y después las temáticas, separados por " · "; debajo, `authorCredit`. Sin la etiqueta "Ejemplo" de la maqueta. Si `coverUrl` es `null`, el hueco de portada con el degradado de la maqueta y sin texto.
- Usa `textContent` también para los nombres de etiqueta y los mensajes de error.

## `client/src/utils/catalog.ts` (lo comprobará un test de paridad con el servidor)

Exporta exactamente:

```ts
export const CATALOG_QUERY_MAX_LENGTH = 100;
export const CATALOG_MAX_TAGS = 10;
export const CATALOG_PAGE_SIZE = 24;

// null si `q` es válida para la API (tras trim: ≤ 100 caracteres y sin '\u0000'); si no, el mensaje.
export function queryProblem(q: string): string | null;

// null si `tags` (slugs separados por comas, '' = sin filtro) es válido para la API: cada slug cumple
// ^[a-z0-9]+(-[a-z0-9]+)*$ y hay como mucho 10 distintos (los repetidos cuentan una vez); si no, el mensaje.
export function tagsProblem(tags: string): string | null;

// Estado normalizado del catálogo a partir de la query de la URL: q (con trim), tags (sin repetidos, en el
// orden de llegada; acepta tags repetido o separado por comas) y page (entero ≥ 1; cualquier otra cosa → 1).
export function readCatalogState(search: URLSearchParams): { q: string; tags: string[]; page: number };

// Query para la API y para los enlaces: omite q vacía, tags vacías y page 1 ('' si no queda nada; si no,
// empieza por '?'). tags con comas.
export function catalogQueryString(state: { q: string; tags: readonly string[]; page: number }): string;
```

## Prioridades (si no te da tiempo a todo, en este orden)

1. **P1:** catálogo completo: filtros, rejilla, tarjetas, paginación, estado vacío, errores y `catalog.ts`.
2. **P2:** hero, mosaico de géneros y Tendencias.
3. **P3:** decoración de la maqueta (accesos rápidos, brillos, degradados, animaciones con `prefers-reduced-motion`).

## Al terminar

Ejecuta `npm run typecheck` y `npm test` y corrige hasta que pasen. Tu último mensaje debe ser una lista breve con: archivos creados o modificados, qué partes de P1, P2 y P3 quedaron hechas, cualquier regla que no hayas podido cumplir y por qué, y cualquier choque entre la maqueta y este encargo que hayas resuelto por tu cuenta.
