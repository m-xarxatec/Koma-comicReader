# Encargo para Codex · E3: diseño del estudio del autor (Koma, pulido)

Trabajas en la rama `diseno-final`. Es el encargo E3 de la pasada de diseño (`docs/plan_mvp.md`, «Pulido»).

Tu tarea es **solo el diseño del cliente** de `/autor`, el estudio del autor. Ya funciona contra la API y tiene tests. Lo quiero:
- bonito, intuitivo, fácil de manejar y llamativo para el público de la presentación;
- pensado sobre todo para el móvil;
- sin cambiar lo que hace.

## 0. Antes de escribir código

1. Lee, en este orden:
 las entradas del 17-nov «Pulido · Estudio del autor con el diálogo de confirmación y el aviso flotante (D2)» y «Bloque 6 · Pruebas en el navegador, revisión de `/autor` y sus correcciones»;
   - `client/public/pages/author.html`;
   - `client/src/pages/author.ts`: cómo pinta cada vista y qué elementos crea, con qué clases;
   - `client/src/utils/author.ts` y `client/src/components/confirm-dialog.ts`;
   - los CSS que enlaza `author.html`, y `client/public/styles/variables.css` entera: sus `--color-*` son la paleta de Koma.
2. **Presenta tus propuestas de diseño, Si ves más de un camino bueno, presenta 2 o 3. Cada propuesta lleva:
   - un nombre y la idea en dos líneas;
   - la disposición de cada vista del estudio en móvil (360 px) y en escritorio (64rem o más), en ASCII. Las vistas son el panel, la obra abierta, el editor de capítulo y la nueva obra;
   - vista por vista, qué queda a la vista y qué pasa detrás de un botón (punto 1.2);
   - los efectos de transición, de color y de desplazamiento: dónde va cada uno y qué se ve sin soporte o con movimiento reducido;
   - los componentes CSS que creas, divides o cambias, y los tokens nuevos;
   - lo que necesitarías tocar en `author.ts`, si hay algo.

   Si algo de este encargo choca con un `CLAUDE.md` o con el contrato, dilo y pregunta. No elijas en silencio.

## 1. Qué construir

1. **La paleta de Koma.** Usa solo los colores de `variables.css`:
   - el fondo, `--color-bg`;
   - las superficies, `--color-surface*`;
   - el acento magenta, `--color-accent`;
   - el lila, `--color-secondary`;
   - el cian, `--color-highlight`;
   - los de estado: `--color-success`, `--color-warning` y `--color-danger`.

   Los degradados, brillos y mezclas nuevos (`color-mix()`) van como tokens propios a partir de esos, sin colores nuevos. El contraste cumple AA: 4,5:1 en el texto, y 3:1 en el texto grande y en los bordes de los controles.
2. **Menos cosas a la vista, más botones.** Cada vista enseña lo principal y una acción principal. Lo secundario va detrás de un botón que lo despliega, y sin JS cuando se pueda:
   - `<details>` y `<summary>` para los bloques que se abren y se cierran (por ejemplo, «Datos de la obra» o los contadores del resumen);
   - el atributo `popover`, con `popovertarget`, para los menús de acciones («⋯»: «Ver ficha», la portada, «Retirar obra»…);
   - ningún `<dialog>` nuevo: la página tiene uno solo, el de confirmar, y un test lo cuenta.

   Lo que escondas cumple esto:
   - se abre también cuando se llega por su enlace (`#nuevo-capitulo`, `#resumen`, `#obra`…), con Atrás y Adelante, y cuando `author.ts` lleva el foco ahí;
   - lo escrito en un formulario no se pierde al cerrarlo;
   - un menú se cierra al elegir una acción y funciona con teclado y con Escape;
   - un botón que muestra o esconde algo dice qué hace: `<summary>` ya da el estado, y un botón de `popover` necesita texto visible o un `aria-label` que lo contenga;
   - cada mensaje queda a la vista cuando aparece: los errores, los avisos, los de carga (`role="status"` y `role="alert"`) y el aviso flotante.
3. **Móvil primero.** Diseña a 360 px y amplía después, en 40rem y en 64rem.
   - Áreas táctiles de 44 px y la acción principal al alcance del pulgar.
   - Sin desplazamiento horizontal, salvo dentro de las tablas, que ya avisan.
   - La navegación entre las secciones del estudio, cómoda con una mano; por ejemplo, una barra que se desplaza o que se fija.
   - En móvil, la navegación de Koma ya ocupa el pie de la pantalla (`--mobile-nav-height`): no la tapes.
4. **Efectos que llamen la atención,** en móvil y en escritorio:
   - **Transiciones:** al pasar el puntero, al pulsar, al enfocar, al abrir y cerrar lo desplegable, y al aparecer el diálogo y el aviso flotante.
   - **Color:** degradados, brillos y bordes que cambian. Cada estado de las tarjetas de obra (en revisión, publicada, rechazada) con su color.
   - **Al desplazarse:** por ejemplo, secciones o tarjetas que aparecen al entrar en pantalla, una barra de progreso o un encabezado que cambia al fijarse. Mejor con CSS (`animation-timeline: view()` o `scroll()`), dentro de `@supports`. Sin soporte, la página se ve entera y quieta. **Nada empieza invisible esperando a una animación o al JS.**
   - Anima solo `transform`, `opacity`, `filter` y los colores: nada que mueva el diseño, es decir, ni `width`, ni `height`, ni los márgenes.
   - Con `prefers-reduced-motion: reduce`, todo queda quieto y en su estado final. Las animaciones ligadas al desplazamiento necesitan `animation: none`: la regla general de `base.css` no basta para ellas.
   - Las duraciones, curvas, desplazamientos y escalas van como tokens.
5. **Punto de abandono (D3):** el texto actual de `abandonmentText` y, además, una barra `<meter>` con el porcentaje de lectores que llegan al final.
   - El texto no cambia.
   - La barra no repite lo que ya dice el texto a un lector de pantalla; por ejemplo, con `aria-hidden="true"`.
   - El `<meter>` va con su estilo en Chrome, Firefox y Safari.
6. **Estados vacíos y de carga cuidados:** sin obras, sin capítulos, sin viñetas o sin comentarios, una frase y la acción que toca («+ Nueva obra», «+ Nuevo capítulo», subir imágenes).

**Lo que no cambia:**
- **Los textos de la interfaz.** Si se te ocurre uno mejor, proponlo; no lo cambies.
- **Las rutas y las vistas:** `?obra=<slug>&capitulo=<n>` y `?vista=nueva-obra`. Las anclas: `#resumen`, `#revisiones`, `#mis-obras`, `#lecturas`, `#comentarios-recientes`, `#donaciones`, `#obra`, `#nuevo-capitulo`, `#editar-obra`, `#capitulo` y `#crear-obra`.
- **Todos los `id`, `data-*`, `name`, `for`, `aria-*`, `role` y `hidden` de `author.html`.** `author.ts` busca cada elemento por su id y, si falta uno, lanza «Falta #… en author.html».
- **Lo que funciona sin JS y el comportamiento:**
  - los tres formularios: sin `action` y con su botón `disabled data-needs-js`;
  - el diálogo de confirmar y el aviso flotante al final de `<main>`;
  - el `<noscript>` de la cabecera;
  - adónde va el foco tras cada acción (`utils/author.ts`), y que las acciones se lancen de una en una.
- **Las tablas de capítulos y de lecturas** siguen siendo `<table>`, con `<caption>` y `<th scope>`.

## 2. Alcance de archivos

- **Puedes tocar:**
  - `client/public/pages/author.html`: marcado, clases y envoltorios nuevos, sin nada de lo que dice «Lo que no cambia».
  - **Los CSS que solo usa `/autor`:** `author-summary.css`, `chapter-editor.css`, `reads-table.css`, `recent-comment.css`, `review-notice.css`, `work-tile.css` y `floating-notice.css`. También los componentes nuevos que hagan falta, uno por bloque BEM (por ejemplo, `studio-nav.css` o `action-menu.css`), enlazados en `author.html`.
  - **Con cuidado, `author-page.css`, `chapter-table.css` y `confirm-dialog.css`:**
    - los dos primeros los usa también `/admin` (`author-page__nav`, `__section`, `__heading*`, `__metric*`, `__message`, `__muted`, `__notice` y `chapter-table*`);
    - `confirm-dialog.css` lo usa también `/comunidad`;
    - lo que cambies en esas clases tiene que seguir viéndose bien en esas páginas. Lo que sea solo del estudio va en clases o en componentes nuevos. Rediseñar `/admin` es del encargo E2.
  - `client/public/styles/variables.css`: **solo añadir** tokens, con el prefijo de su componente (`--author-*`, `--studio-*`, `--work-tile-*`…).
  - `client/public/icons/sprite.svg`: solo añadir iconos, con el mismo `viewBox` y el mismo trazo que los demás.
  - **`client/src/pages/author.ts`, solo en la presentación:**
    - las clases de lo que crea;
    - el `<meter>` del punto 1.5;
    - si hace falta, abrir un desplegable cuando `author.ts` lleva a algo que está dentro.

    Ni peticiones, ni validación, ni rutas, ni foco, ni el orden de las acciones. Pon en la propuesta lo que vayas a cambiar y espera mi OK.
- **No toques:**
  - `client/src/utils/`, `client/src/services/`, `client/src/components/` ni las demás páginas;
  - **los tokens que ya existen**: cambiar uno compartido es del encargo E4;
  - **`layers.css`**: si una capa es imprescindible, propónla;
  - **los componentes compartidos:** `button.css`, `form.css`, `panel-card.css`, `status-badge.css`, `text-link.css`, `breadcrumb.css`, `site-header.css`, `site-footer.css` y `mobile-nav.css`. Si uno se queda corto, haz un modificador en tu componente o propónlo;
  - `server/` (tampoco sus tests: ninguno se modifica ni se borra), `layout.ts`, `docs/`, los tres `CLAUDE.md`, `.claude/`, `package.json` ni las dependencias.
- **Git:**
  - En este encargo te autorizo a hacer commits y `push` en `diseno-final`, y solo en esa rama. Es una excepción a «Git y GitHub los maneja solo el usuario» de `CLAUDE.md`.
  - Commits en español, con el formato de `CLAUDE.md` (`style(author): … (D2)`) y sin líneas de firma: ni `Co-Authored-By` ni ninguna otra.
  - Nunca hagas merge, rebase ni `push --force`, no toques otras ramas y no abras un PR contra `main` ni `develop`. La integración la hago yo, después de revisar el diseño.
  - Ningún commit incluye `.claude/`.
  - No leas, crees ni copies `.env`, `.env.online` ni `docs/credenciales.local.md`.

## 3. Reglas que no se negocian (de los `CLAUDE.md`)

- HTML, CSS y TypeScript sin frameworks, sin bundler y sin dependencias nuevas: ni librerías de animación, ni fuentes externas, ni nada desde un CDN. Ningún `any` ni `@ts-ignore`.
- Sin scripts ni estilos en línea, sin `style=` ni `on*=`: la CSP de helmet los bloquea. Sin `innerHTML`: los datos se pintan con `textContent`.
- **CSS:**
  - mobile-first, con `min-width: 40rem` y `64rem` (más `prefers-reduced-motion`) y ningún otro corte; los `@media`, al final de cada hoja;
  - BEM y un archivo por componente, sin selectores de hijo por etiqueta (`> div`): cada elemento lleva su clase;
  - **todo valor visual en `variables.css`**: colores, degradados, sombras, espacios, tamaños, radios, giros, desplazamientos, escalas, duraciones y curvas. Nunca literales en los componentes. Solo se admite la geometría interna de una animación (los % de sus `@keyframes`), con un comentario;
  - cada token que añades se usa; los `z-index`, en `layers.css`;
  - `[hidden]` ya lo oculta `base.css` para todos: no lo repitas;
  - el desplazamiento de las anclas lo da `scroll-padding-top` en `base.css`: no uses `scroll-margin-top` con `--scroll-offset`;
  - solo tema oscuro, sin ningún `prefers-color-scheme`, y fuentes del sistema;
  - `:focus-visible` visible en todo lo que se enfoca.
- **HTML semántico que se entiende sin JS:** un solo `<h1>` («Estudio del autor») y lo decorativo con `aria-hidden="true"`.
- **Idioma:** los textos de la interfaz, en español; el código, en inglés.

## 4. Lo que comprueban los tests

Ninguno se modifica. Si crees que uno te impide algo, para y explícamelo: la aserción de antes, la de después y el motivo. Sin mi permiso, no se cambia.

**`server/src/tests/api/pages.test.ts`, «/autor»:**
- el `<title>` «Estudio del autor · Koma» y un solo `h1`, «Estudio del autor»;
- ningún `{{`, y el nombre del autor escapado en el `value` de `#comic-author-credit`;
- exactamente `<form class="…" id="comic-form">`, y lo mismo con `id="chapter-form"` y con `id="edit-form"`: la clase, el id y nada más;
- tres `type="submit" disabled data-needs-js`;
- ni `/admin` ni `NC 4.0` en la página;
- `<caption class="chapter-table__caption"` y, en la tabla de capítulos, seis `<th class="chapter-table__head" scope="col">`;
- `href="/autor?vista=nueva-obra"` y `<section id="crear-obra" class="…" … hidden>`, con `#comic-form` fuera del tramo entre `id="studio-view"` e `id="crear-obra"`;
- `id="obra-new-chapter" href="#nuevo-capitulo"`;
- en `/admin`, `<span class="author-page__metric-label">`.

**`api/author-dialog-page.test.ts`:**
- un solo `<dialog`, exactamente `<dialog class="confirm-dialog" id="confirm-dialog" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-text">`, con su `<form … method="dialog">`, su título, su texto, Cancelar y Confirmar;
- `<p class="floating-notice" role="status" aria-live="polite" data-notice></p>` justo antes de `</main>`, y un solo `data-notice`;
- `confirm-dialog.css` y `floating-notice.css` enlazados;
- `id="summary-message" role="status"`;
- tres `data-form-error role="alert"`.

**`api/author-review-page.test.ts`:**
- el `<h3>` de «Datos de la obra», enfocable (`tabindex="-1"`), con el id y la clase que fija el test en tu rama;
- un solo `<noscript>`;
- `#edit-content-warning` con `aria-describedby="edit-content-warning-hint edit-content-warning-error"`.

**`server/src/tests/unit/`:**
- `client-author-review.test.ts`:
  - las pistas de los límites de `author.html`, tal cual: `obra-cover-hint`, `comic-cover-hint`, `editor-images-hint` y las de la sinopsis, las etiquetas y la advertencia;
  - los `aria-label` «Ver ficha de…» y «Ver motivo del rechazo de…» en `author.ts`.
- `client-confirm-dialog.test.ts`: `author.ts` sin `confirm(`, importando `confirm-dialog.js` y con tres `confirmAction(`.
- `client-styles.test.ts`, las reglas del CSS del apartado 3:
  - cada token, usado;
  - los `@media`, al final;
  - ningún `> etiqueta`, ningún `[hidden]` repetido y ningún `scroll-margin-top` con `--scroll-offset`;
  - ningún `:hover` que repita su regla base;
  - cada `aria-*` de un selector, puesto por alguna plantilla, el TS del cliente o el servidor;
  - `.button` sin `overflow-wrap: anywhere`.
- `layout.test.ts`, el del tema (un solo `--color-bg` y ningún `prefers-color-scheme`) y `no-any.test.ts`.

## 5. Comprobación

- Si tu entorno no tiene Postgres, no ejecutes `npm run test:api` ni el servidor: eso lo hago yo.
- `npm run typecheck` y `npm test`, en verde. Revisa tu diff con «Definición de terminado» de `CLAUDE.md`.
- Ningún resultado de tus archivos en estas búsquedas:
  - colores literales: `rg -n "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(" client/public/styles/components`;
  - estilos o eventos en línea: `rg -n "style=|on[a-z]+=" client/public/pages/author.html`.
- **En el navegador lo pruebo yo**, como `author@demo.test` y con los datos de `npm run demo:data`:
  - a 360 px, entre 40 y 64rem, y desde 64rem;
  - con teclado y con el movimiento reducido;
  - en Chrome y en Firefox, y en Safari de iPhone si puedo;
  - también `/admin` y `/comunidad`, que comparten estilos con el estudio.

## 6. Entrega

1. Primero las propuestas (apartado 0.2), y espera mi OK.
2. Cuando termines la elegida, entrega:
   - qué has hecho, en 5–8 líneas;
   - los archivos tocados;
   - los tokens nuevos, con su valor;
   - lo que hay que mirar en el navegador, vista por vista;
   - qué se ve sin soporte de los efectos y con el movimiento reducido;
   - los commits que has hecho en `diseno-final`;
   - una entrada de bitácora propuesta, como texto, sin editar `docs/bitacora.md`.
