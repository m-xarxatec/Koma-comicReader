# Encargo para Codex · Diseño de lo recuperado de la maqueta en /admin (Koma, bloque 4)

Trabajas en el worktree `../koma-admin` (rama `feat/admin-maqueta`) del proyecto Koma, una plataforma de cómics estilo webtoon. Tu tarea es **solo el cliente** de `/admin`: diseñar e integrar cuatro elementos de la maqueta que la página todavía no tiene, siendo fiel a ella. El panel ya funciona contra la API y tiene tests; no cambias su comportamiento.

No puedes leer nada fuera del worktree. Todo lo que necesitas está dentro:
- **Proyecto:** `CLAUDE.md` y `docs/`.
- **Maqueta**, copiada en `.claude/maqueta/` (solo lectura; git la ignora):
  - `admin/index.html`: la página de referencia;
  - `styles/components/panels.css`: sus estilos (`.section-heading`, `.status*`, `.data-panel`, `.table-toolbar`, `.table-count`, `.panel-columns*`, `.info-card*` y `.demo-feedback`, más los cortes de 40rem y 64rem al final);
  - `styles/variables.css` y `styles/base.css`: los valores que usan esos estilos;
  - `scripts/admin-panel.js`: cómo se muestra el aviso (`notify`);
  - `PANELES-README.md`.

  La maqueta tiene tema claro: ignóralo, porque Koma solo tiene tema oscuro.

## 0. Antes de escribir código

1. Lee, en este orden:
   - `CLAUDE.md` (manda sobre todo lo demás);
   - en `docs/plan_mvp.md`, el "Contrato de la API del bloque 4", en especial "Panel del admin" y "Páginas";
   - las últimas entradas de `docs/bitacora.md`, en especial "Agente frontend sobre /admin: lo funcional";
   - `client/public/pages/admin.html`, `client/src/pages/admin.ts` y `client/public/styles/components/admin-page.css`;
   - en la maqueta, `admin/index.html` y los estilos de arriba.
2. **Propón el diseño antes de implementarlo y espera mi OK:**
   - dónde va cada elemento, en móvil (360 px) y en escritorio (64rem o más), en ASCII o en una lista por zonas;
   - los componentes CSS que creas o cambias;
   - los tokens nuevos de `variables.css`, con el valor de la maqueta del que sale cada uno;
   - cada desvío de la maqueta y su motivo (por ejemplo, el área táctil de 44 px).

   Si algo de este encargo choca con `CLAUDE.md` o con el contrato, dilo y pregunta. No elijas en silencio.

## 1. Qué construir

Los cuatro, fieles a la maqueta (`admin/index.html`):

1. **Distintivo «N pendientes»** en la cabecera de la sección «Cola de aprobación» (maqueta: `<span class="status status--warning">8 pendientes</span>` dentro de `.section-heading`).
   - **Dato:** `GET /api/admin/review` → `counts.comics + counts.chapters`. Es el total real, aunque la lista se corte en 100 de cada tipo. `loadReview()` ya lo recibe y lo pinta en la métrica (`data-pending-total`).
   - Con 0, no lo muestres o di «Sin pendientes»; propón cuál.
2. **Contadores «N resultados»** en las cuatro tablas (maqueta: `<p class="table-count">4 resultados</p>`, en la barra de filtros, `.table-toolbar`, dentro de la tarjeta `.data-panel`).
   - **Datos:**
     - cola: `items.length` (las filas que se ven);
     - comentarios, usuarios y auditoría: `total` de `{ …, page, pageSize, total }` (todas las páginas con los filtros aplicados; hay 50 por página).
   - Usa singular y plural: «1 resultado», «N resultados».
   - Se actualiza en cada carga, también al filtrar y al cambiar de página. Si la carga falla, no muestres un número viejo.
   - La cola no tiene filtros, porque el contrato no los da. Propón dónde va su contador.
   - Si para ser fiel a la maqueta metes los filtros y la tabla en una tarjeta (`.data-panel`, con la barra de filtros con relleno y borde inferior), dilo en la propuesta.
3. **Tarjeta «Notas para el equipo»** junto a «Parámetros» (maqueta: `.panel-columns.panel-columns--admin` con `#parametros` y `.panel-card.info-card`; desde 64rem van en dos columnas).
   - **Texto estático**, sin datos, sin peticiones ni nada editable.
   - El texto de la maqueta ya no es cierto ("Cuando se conecte el backend…"). Usa este, adaptado a lo que hace el servidor:
     - antetítulo: «Notas para el equipo»;
     - título (`h2`): «Moderación clara, sin sorpresas.»;
     - párrafo: «Cada aprobación, rechazo, ocultación, cambio de cuenta y modificación de parámetros indica quién la hizo y queda registrada en la auditoría.»;
     - tres items, con su distintivo:
       - «Pendiente»: «La cola requiere revisión humana.»
       - «Rechazo»: «Debe acompañarse siempre de un motivo visible para el autor.»
       - «Aprobado»: «La decisión la confirma el servidor antes de publicarse.»
   - Los distintivos usan `status-badge.css` (`status-badge--warning`, `--danger` y `--success`), no las clases `.status` de la maqueta.
   - El fondo con degradado de `.info-card` va con tokens.
4. **Aviso flotante abajo** para las acciones (maqueta: `.demo-feedback`, `position: fixed`, centrado, por encima de la navegación móvil: 85px; desde 64rem, 22px).
   - Ya existe y funciona: `<p class="admin-page__feedback" role="status" aria-live="polite" data-live>`, último hijo de `main`. Lo rellena `announce()` en `admin.ts`, que lo vacía y lo vuelve a escribir para que se anuncie también un aviso repetido.
   - Hoy lleva una posición mínima provisional (`position: sticky`, en `admin-page.css`, con `--admin-feedback-offset`, `--admin-feedback-offset-wide` y `--layer-admin-feedback`). Sustitúyela por el diseño de la maqueta.
   - Reglas que se mantienen:
     - **nunca** `hidden` ni `display: none` en la región: tiene que estar siempre en el árbol para que el lector de pantalla la anuncie. Que solo se vea con texto (`:empty` / `:not(:empty)`);
     - el `z-index` sale de `layers.css` (`--layer-admin-feedback`; si hace falta otro valor, cámbialo allí y justifícalo);
     - no debe tapar la navegación móvil (por debajo de 64rem) ni el `<dialog>` (que va en la capa superior).
   - La maqueta no lo oculta nunca. Si propones cerrarlo (un botón «Cerrar» o un tiempo), se hace vaciando su `textContent`, no ocultándolo, y el foco no se mueve solo.

**Sin tocar lo funcional.** Se mantienen tal como están:
- el foco tras cada acción (`run` y `focusList`);
- el diálogo, que solo se resuelve en `close`, con `AbortController`;
- los `role="status"` de los mensajes de cada lista;
- la paginación, los filtros y la caja de error de los parámetros;
- el aviso «Plataforma de demostración: los pagos son de Stripe en modo prueba».

Si para pintar los contadores tienes que tocar `admin.ts`, hazlo dentro de `showRows`, `showError` y `updatePager`, o de `loadReview`, `loadComments`, `loadUsers` y `loadAudit`, y siempre con `textContent`.

## 2. Alcance de archivos

- **Puedes tocar:**
  - `client/public/pages/admin.html` y `client/src/pages/admin.ts`;
  - `client/public/styles/components/admin-page.css` y los componentes nuevos que hagan falta (uno por bloque BEM, por ejemplo `admin-notes.css` o `admin-feedback.css`), enlazados en `admin.html`;
  - `client/public/styles/variables.css` (añadir tokens) y `client/public/styles/layers.css` (solo `--layer-admin-feedback`).
- **No toques:**
  - `author-page.css`, `chapter-table.css`, `status-badge.css`, `form.css` ni otros componentes compartidos: los usa también `/autor`. Si necesitas algo de ellos, añádelo en un componente del admin;
  - `client/src/services/`, `client/src/utils/`, el servidor (`server/`), salvo `server/src/tests/api/pages.test.ts` y solo si el diseño cambia algo que comprueba (justifícalo);
  - `layout.ts`, el resto de páginas, `docs/`, `CLAUDE.md`, `package.json` ni las dependencias.
- **Git lo maneja el usuario.** No hagas `git add`, `commit`, `push` ni ramas. Al terminar, entrega los comandos `git add` y `git commit` listos para copiar, sin líneas de firma. `.claude/` no va a ningún commit.

## 3. Reglas que no se negocian (de `CLAUDE.md`)

- HTML, CSS y TypeScript sin frameworks, sin bundler y sin dependencias nuevas. TypeScript estricto y **ningún `any`**: ni `as any` ni `@ts-ignore`. Lo comprueba `npm test` (`no-any.test.ts`). Imports con `.js`.
- Sin scripts ni estilos en línea, sin `style=` ni `on*=`: la CSP de helmet lo bloquea. Sin `innerHTML`: los textos van con `textContent`.
- **CSS:**
  - mobile-first con `min-width: 40rem` y `64rem`; BEM; un archivo por componente;
  - **todo valor visual en `variables.css`**: colores, degradados, sombras, espacios, tamaños, radios y desplazamientos van como tokens, nunca literales en los componentes;
  - los `z-index` van en `layers.css`;
  - solo tema oscuro y fuentes del sistema;
  - `:focus-visible` visible y áreas táctiles de 44 px.
- HTML semántico que se entiende sin JS: un solo `<h1>` («Panel de administración»). La tarjeta de notas es una `section` con su `h2` (o `aria-label`, como en la maqueta). El distintivo y los contadores no son la única forma de saber el dato: la métrica y la paginación siguen diciéndolo.
- Textos de la interfaz en español; el código, en inglés.

## 4. Lo que comprueba `server/src/tests/api/pages.test.ts` (test «/admin sirve admin.html al admin…»)

Mantén:
- el `<title>` «Panel de administración · Koma» y un solo `h1`;
- `<section id="aprobaciones|comentarios|usuarios|parametros|auditoria"` con su `href="#…"`;
- `<dialog class="admin-dialog" id="admin-dialog"`;
- el botón `<button class="button button--primary" type="submit" disabled data-needs-js>Guardar parámetros</button>`;
- exactamente 4 `<caption`, sin «Ir al estudio del autor»;
- `<strong>Plataforma de demostración:</strong> los pagos son de Stripe en modo prueba` y nada de «no modifican información real»;
- los 4 `data-message="(review|comments|users|audit)" role="status" tabindex="-1"`;
- `<p class="admin-page__feedback" role="status" aria-live="polite" data-live></p>` justo antes de `</main>`. Si cambias su clase, actualiza el test y justifícalo.

En `server/src/tests/unit/layout.test.ts`: los marcadores `<!-- @head -->`, `<!-- @header -->` y `<!-- @footer -->` una vez cada uno, y `layers.css` enlazado entre `variables.css` y `base.css`.

## 5. Comprobación

- **Tu sandbox no tiene red:** no puedes instalar paquetes, conectarte a Postgres ni ejecutar `npm run test:api` ni el servidor. Ejecuta `npm run typecheck` y `npm test` (deben pasar) y revisa tu diff con la lista de "Definición de terminado" de `CLAUDE.md`.
- Las pruebas de API y las del navegador (360 px y escritorio, con teclado y lector de pantalla) las hace el usuario, entrando como `admin@demo.test` con los datos de `npm run demo:data`.

## 6. Entrega

1. Qué has hecho, en 5–8 líneas.
2. Los archivos tocados.
3. Los tokens nuevos, con el valor de la maqueta del que sale cada uno, y los desvíos.
4. La lista de lo que hay que mirar en el navegador.
5. Los comandos `git add` y `git commit` (formato `feat(admin): … (RN-05)`).
6. Una entrada de bitácora propuesta, como texto, sin editar `docs/bitacora.md`.
