# Encargo T13, vuelta 3 · Correcciones de la home de Koma

Trabajas en `/home/evilsec/Documentos/portafolio/koma-t13` (rama `t13-codex`), sobre la home que escribiste en la vuelta 2. Desde entonces, el revisor y el desarrollador cambiaron cosas que NO debes deshacer:

- El resultado del catálogo se anuncia solo en `<p class="visually-hidden" id="catalog-status" role="status">` (función `announce` de `home.ts`); la región de tarjetas no es `aria-live`.
- La rejilla de géneros (`#genre-grid`) no lleva `aria-label`.
- `queryProblem` cuenta puntos de código (`Array.from(value).length`), como zod 4 en el servidor.
- El filtro solo tiene el grupo "Género" (se quitó "Temática" por decisión del desarrollador); el `<summary>` dice "Filtrar catálogo por título, autor o género" y el formulario es `action="/#catalogo"`.
- `client/public/icons/sprite.svg` está corregido: no lo toques.

Las reglas de la vuelta 2 siguen vigentes; las tienes en `/home/evilsec/Documentos/portafolio/ultimo_entregable_xarxa/.git/codex-t13/encargo.md` (léelo primero). En resumen: solo `client/public/pages/home.html`, `client/public/styles/components/` (archivos de la home), `client/public/styles/variables.css` y `layers.css` (solo añadir), `client/src/pages/home.ts`, `client/src/components/` y `client/src/utils/catalog.ts`. Nada de `server/`, `docs/`, `CLAUDE.md`, `package.json`, `api.ts`, `header.ts`, `icons/` ni otras páginas. Sin commits ni `git add`. Ejecuta `npm run typecheck` y `npm test` al terminar.

Maqueta (solo lectura): `/home/evilsec/Descargas/entregable/base_codigo/KOMA_errores_frontend/koma_home/` (`index.html` y `styles/components/{hero,quick-links,comic-card,genres}.css`).

## Regla nueva: fidelidad a la maqueta sin redondear

Cuando un valor de la maqueta (tamaño, espacio, interlineado, tracking, radio, opacidad, duración, proporción…) no coincide EXACTAMENTE con un token existente de `variables.css`, **crea un token nuevo en `variables.css` con nombre del proyecto** (`--font-size-…`, `--space-…`, `--line-height-…`, `--letter-spacing-…`, `--radius-…`, `--home-…`) y úsalo. No lo redondees al token más cercano. Los colores nuevos llevan también su valor en el bloque `@media (prefers-color-scheme: light)`.

## Lo que hay que corregir (informe del revisor, archivo:línea de tu versión)

1. **Foco recortado en las tarjetas** (`comic-card.css`): `.comic-card` tiene `overflow: hidden` y el contorno de foco del enlace (3 px por fuera) no se ve. Haz visible el foco: `outline-offset` negativo con un token en `.comic-card__link:focus-visible`, o el contorno en `.comic-card:has(.comic-card__link:focus-visible)`.
2. **Títulos de sección** (`section-heading.css`): la maqueta usa `font-size: clamp(1.3rem, 2.3vw, 1.65rem)` y `line-height: 1.25`, no `--font-size-xl`.
3. **Descripción del hero** (`hero.css`): tamaño `1rem` (`--font-size-base`) y ancho máximo `32rem` (token nuevo), no `--font-size-lg` ni `47ch`.
4. **Hero** (`hero.css`): faltan `.hero { min-height: 280px }` desde 40rem y `.hero__copy { padding: 2.65rem 3rem }` desde 64rem.
5. **Accesos rápidos** (`quick-links.css`): desde 40rem faltan `gap: .9rem; padding: .75rem` en `.quick-links`, `padding: .75rem` en `.quick-link`, icono de `2.15rem`, `strong` a `1rem` y `small` a `.83rem`. Y los valores base de la maqueta: gap `.6rem`, padding `.65rem`, `.quick-link` gap `.55rem` y padding `.55rem .4rem`, icono `1.8rem`, `line-height: 1.3`, `strong` `.91rem`, `small` `.72rem`, y la transición de fondo (`transition: background var(--duration-fast)`). El icono, con un token de tamaño de icono, no con uno de espacio.
6. **Proporción de portada en escritorio**: sustituido por la decisión de las portadas verticales (más abajo). No añadas la 1,30/1.
7. **Géneros** (`genres.css`): desde 40rem, `grid-auto-columns: minmax(128px, 19%)` y, desde 64rem, `min-height: 115px` en `.genre-tile`. **El `repeat(auto-fit, …)` de 64rem se queda** (decisión del desarrollador: la fila se adapta al número de géneros).
9. **CSS duplicado de formulario** (`catalog-filters.css`): `__field`, su `label` y su `input` repiten `.form__field`, `.form__label` y `.form__input` de `client/public/styles/components/form.css`. Enlaza `form.css` en `home.html` (después de `button.css`) y usa esas clases en el campo "Título o autor"; borra las reglas duplicadas. No modifiques `form.css`.
10. **Foco recortado en los carriles con desplazamiento** (`genres.css` y `.comic-grid--trending`): con `overflow-x: auto` y solo 4 px arriba, el anillo de foco (3 px + 3 px de separación) se corta. Dales `padding-inline` y `padding-block` de al menos `calc(var(--focus-ring) + var(--focus-offset))`.
11. **`autocomplete="off"`** en el campo `q` de los filtros.
13. **Un bloque por archivo**: `.home-main` sale de `hero.css` a su propio archivo (p. ej. `home-main.css`); `.content-section` y `.text-link` salen de `section-heading.css` a `content-section.css` y `text-link.css`. Enlázalos en `home.html`.
14. **Sin JavaScript**: el `<p id="catalog-message">` empieza vacío (y `hidden`) y `aria-busy="true"` lo pone `home.ts` al empezar la carga, no el HTML. Así, sin JS, solo se ve el `<noscript>`.
15. **Quita `maxlength="100"`** del campo `q`: el navegador cuenta unidades UTF-16 y cortaría antes que el servidor; ya valida `queryProblem`.
16. **Paginación deshabilitada** (`catalog-pagination.css`): el `span` deshabilitado conserva el hover de `.button--outline`; neutraliza también `border-color` y `background` en `:hover`.
18. **Tokens y repeticiones**: token de tamaño de icono para `.quick-link__icon` (punto 5); quita la regla de `catalog-filters.css` a 64rem que repite la de 40rem; quita `--color-home-scrollbar-track: transparent` del bloque del tema claro (repite el valor por defecto).
19. **Página fuera de rango** (`home.ts`): con `?page=` mayor que el número de páginas (p. ej. 99 con 2 páginas), el mensaje vacío dice "Esa página no existe: el catálogo tiene 2 páginas" (singular con 1) y la paginación muestra solo "Anterior", que lleva a la última página (la 2, no la 98). Si el catálogo está vacío (0 páginas), sin paginación.

(Los números 8, 12 y 17 no se corrigen como hallazgo: el 8 ya está hecho y el 12 y el 17 son las decisiones siguientes.)

## Decisiones del desarrollador

- **Portadas verticales sin recortes.** Las tarjetas pasan a vertical con la proporción de la portada real del catálogo (1055 × 1491 px): `aspect-ratio: 1055 / 1491` en un token (`--home-cover-ratio`) en todos los anchos, y en `comic-card.ts` `width`/`height` del `<img>` con esa misma proporción (por ejemplo, 211 × 298). La imagen nunca se recorta: `object-fit: contain`, con el degradado de fondo visible si una portada tiene otra proporción. Ajusta las columnas de los carriles y de la rejilla del catálogo para que las tarjetas verticales no queden enormes (revisa a 360 px, 700 px y 1440 px).
- **Portadas sin imagen: los cinco degradados de la maqueta**, alternando por posición en la lista (`índice % 5`): violet `#362268 → #7047ad`, rose `#501b47 → #b33476`, blue `#142f59 → #267b9a`, amber `#633b48 → #af6f76`, indigo `#302459 → #565fa0` (todos a 135deg). Cada uno, con sus colores en tokens (`--color-home-cover-violet-from`…) y su variante clara, y un modificador BEM (`comic-card__cover--violet`…). Sustituyen al degradado único actual. Las portadas con imagen también llevan el modificador (se ve detrás si la imagen no llena el hueco).

## Al terminar

`npm run typecheck` y `npm test` en verde. Tu último mensaje: lista breve con los archivos tocados, cada punto (1–19 y las dos decisiones) con "hecho" o "no hecho y por qué", y los tokens nuevos que creaste.
