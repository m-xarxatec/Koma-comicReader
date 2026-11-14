# Encargo para Codex · Frontend del estudio del autor con su panel (Koma, bloque 3)

Trabajas en el worktree `../koma-estudio` (rama `feat/estudio-panel`) del proyecto Koma, una plataforma de cómics estilo webtoon. Tu tarea es **solo el cliente** de `/autor`: un diseño nuevo del estudio con el panel tipo YouTube Studio. La API del panel ya existe y tiene tests.

## 0. Antes de escribir código

1. Lee, en este orden:
   - `CLAUDE.md` (manda sobre todo lo demás);
   - en `docs/plan_mvp.md`, el "Contrato de la API del bloque 3": "Obras del autor", "Capítulos y viñetas", **"Panel del autor"** y "Páginas";
   - las últimas entradas de `docs/bitacora.md`.
2. `docs/ideas_base.md` y `docs/modelo_datos.md` no están en el worktree (git los ignora). Léelos en `/home/evilsec/Documentos/portafolio/ultimo_entregable_xarxa/docs/`. Son solo lectura.
3. Lenguaje visual de referencia (la maqueta): `/home/evilsec/Descargas/entregable/base_codigo/KOMA_errores_frontend/koma_home/` (`autor/index.html` y su CSS). Es solo lectura.
4. **Propón el diseño antes de implementarlo y espera mi OK:**
   - disposición en móvil (360 px) y escritorio, en ASCII o en una lista por zonas;
   - qué componentes CSS creas o cambias;
   - los tokens nuevos de `variables.css`;
   - cómo se navega entre las vistas.

   Si algo de este encargo choca con `CLAUDE.md` o con el contrato, dilo y pregunta. No elijas en silencio.

## 1. Qué construir

La vista por defecto de `/autor` pasa a ser un **panel** con estas secciones:

1. **Resumen.**
   - `displayName`, "En Koma desde" (`authorSince` con `Intl.DateTimeFormat('es-ES')`) y los recuentos de obras por estado (`comics`) y de capítulos por estado (`chapters`).
   - "Control editorial": las obras y los capítulos en revisión o rechazados con su motivo. Los motivos salen de `GET /api/author/comics` (`rejectionReason`), no del panel.
2. **Lecturas (RN-19).**
   - Total, últimos 7 y últimos 30 días (`reads`), por obra (`works[].reads`) y por capítulo (`works[].chapters[].reads`).
   - Una tabla accesible (`<caption>`, `<th scope>`).
   - Barras dibujadas solo con CSS si quieres, sin librerías ni `<canvas>`. Ninguna barra se entiende solo por su color: el número siempre está escrito.
   - Una obra sin lecturas muestra ceros, con un texto del tipo "Todavía sin lecturas".
   - `today` es el día de referencia: puedes mostrarlo ("Datos hasta el 7 nov").
3. **Comentarios recientes.** Los 10 de `recentComments`: autor, fecha, obra y capítulo, y un enlace a la viñeta `/leer/:slug/:numero#v-:panelPosition`. Todo con `textContent`, porque `body` es texto del usuario.
4. **Donaciones.** Una tarjeta **estática** "Próximamente": sin datos, sin botón que haga algo, sin petición y sin prometer fechas. Es la fase 3: no crees nada más para ella.
5. **Lo que ya existe, sin perder nada.**
   - "Mis obras" (tarjetas con "+ Nuevo capítulo" salvo en las rechazadas).
   - La vista de nueva obra (`?vista=nueva-obra`).
   - La obra abierta (`?obra=<slug>`), con capítulos, nuevo capítulo, datos de la obra, portada y retirar.
   - El editor de capítulo (`?capitulo=<n>`), con subir, ↑↓, ×, enviar, vista previa y retirar.
   - Puedes reorganizar dónde va cada cosa, pero el comportamiento y la accesibilidad actuales (foco, `aria-live`, confirmaciones y `history.pushState` con `popstate`) se mantienen.

**API.** El panel es `GET /api/author/dashboard` → `{ dashboard: AuthorDashboardDto }`, y lo demás, las rutas que ya usa `author.ts`. Duplica en el cliente los tipos del contrato de forma explícita, como hace hoy `author.ts`. Todas las peticiones pasan por `client/src/services/api.ts` (`api.get`…, `ApiResult<T>`). Si una petición falla, el resto del panel se muestra igual, con un mensaje en la sección que ha fallado.

## 2. Alcance de archivos

- **Puedes tocar:**
  - `client/public/pages/author.html` y `client/src/pages/author.ts`; si lo divides, en archivos nuevos de `client/src/components/` con un nombre claro;
  - los CSS del estudio en `client/public/styles/components/` (`author-page.css`, `work-tile.css`, `panel-card.css`, `review-notice.css`, `chapter-table.css` y `chapter-editor.css`) y los archivos nuevos que hagan falta, uno por componente BEM;
  - `client/public/styles/variables.css`, para añadir tokens.
- **No toques:**
  - el servidor (`server/`), salvo los tests de `server/src/tests/api/pages.test.ts`, y solo si el diseño cambia algo que comprueban (justifícalo);
  - `layout.ts`, el resto de páginas, `docs/`, `CLAUDE.md`, `package.json` ni las dependencias.
- **Git lo maneja el usuario.** No hagas `git add`, `commit`, `push` ni ramas. Al terminar, entrega los comandos `git add` y `git commit` listos para copiar, sin líneas de firma.

## 3. Reglas que no se negocian (de `CLAUDE.md`)

- HTML, CSS y TypeScript sin frameworks, sin bundler y sin dependencias nuevas. TypeScript estricto y **ningún `any`**: ni `as any` ni `@ts-ignore`. Lo comprueba `npm test` (`no-any.test.ts`). Imports con `.js`.
- Sin scripts ni estilos en línea, sin `style=` ni `on*=`: la CSP de helmet lo bloquea. Sin `innerHTML` con datos: los textos del usuario van con `textContent`.
- **CSS:**
  - mobile-first con `min-width: 40rem` y `64rem`; BEM; un archivo por componente;
  - **todo valor visual en `variables.css`**: colores, espacios, tamaños, radios y sombras van como tokens, nunca literales en los componentes;
  - los `z-index` van en `layers.css`;
  - solo tema oscuro y fuentes del sistema;
  - `:focus-visible` visible y áreas táctiles de 44 px.
- HTML semántico que se entiende sin JS: un solo `<h1>` ("Estudio del autor") y el `<title>` "Estudio del autor · Koma". Los formularios no llevan `action` y sus botones llegan `disabled data-needs-js`. Se mantiene el aviso `<noscript>`. `loading="lazy"` salvo en la primera pantalla.
- Formularios con `bindForm`, un `store` mínimo en la página y los límites duplicados de `client/src/utils/validate.ts`.
- Textos de la interfaz en español; el código, en inglés.

## 4. Lo que comprueban los tests (`server/src/tests/api/pages.test.ts` y `server/src/tests/unit/layout.test.ts`)

Mantén, salvo que el diseño exija otra cosa y lo justifiques:
- los ids `comic-form`, `chapter-form` y `edit-form`, sin `action`, y exactamente 3 `type="submit" disabled data-needs-js`;
- `<caption class="chapter-table__caption"` y 6 `<th class="chapter-table__head" scope="col">` en la tabla de capítulos;
- `href="/autor?vista=nueva-obra"`, `<section id="crear-obra" … hidden>` fuera de `id="studio-view"`, e `id="obra-new-chapter" href="#nuevo-capitulo"`;
- un solo `h1` "Estudio del autor", sin `/admin` y sin licencias NC;
- los marcadores `<!-- @head -->`, `<!-- @header -->` y `<!-- @footer -->` una vez cada uno, y `layers.css` enlazado entre `variables.css` y `base.css`.

## 5. Comprobación

- **Tu sandbox no tiene red:** no puedes instalar paquetes, conectarte a Postgres ni ejecutar `npm run test:api` ni el servidor. Ejecuta `npm run typecheck` y `npm test` (deben pasar) y revisa tu diff con la lista de "Definición de terminado" de `CLAUDE.md`.
- Las pruebas de API y las del navegador (360 px y escritorio, con teclado) las hace el usuario. Datos para verlo: `npm run demo:data` en local (la autora demo tiene 4 obras con lecturas y comentarios).

## 6. Entrega

1. Qué has hecho, en 5–8 líneas.
2. Los archivos tocados.
3. La lista de lo que hay que mirar en el navegador.
4. Los comandos `git add` y `git commit` (formato `feat(author): … (RN-19)`).
5. Una entrada de bitácora propuesta, como texto, sin editar `docs/bitacora.md`.
