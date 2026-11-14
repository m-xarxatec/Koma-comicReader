# Encargo para Codex · E1: diseño de premium, gracias y pago simulado (Koma, pulido)

Trabajas en el worktree `../koma-premium` (rama `feat/premium-diseno`) del proyecto Koma, una plataforma de cómics estilo webtoon. Es el primer encargo de la pasada de diseño (E1 de E1–E4). Tu tarea es **solo el diseño del cliente** de tres páginas que ya funcionan contra la API y tienen tests:

- `/premium`, la oferta;
- `/premium/gracias`, la espera y la bienvenida: es la misma plantilla en dos vistas;
- `/pago-simulado`.

Tienes que ser fiel a la maqueta sin cambiar el comportamiento.

No puedes leer nada fuera del worktree. Todo lo que necesitas está dentro:
- **Proyecto:** `CLAUDE.md` y `docs/`.
- **Maqueta**, copiada en `.claude/maqueta/` (solo lectura; git la ignora):
  - `premium/index.html`, `premium/gracias/index.html`, `premium/bienvenida/index.html` y `pago-simulado/index.html`: las páginas de referencia;
  - `styles/premium.css` y `styles/components/premium.css`: sus estilos;
  - `styles/variables.css` y `styles/base.css`: los valores que usan esos estilos;
  - `scripts/premium-demo.js` y `PREMIUM-README.md`.

  La maqueta tiene tema claro: ignóralo, porque Koma solo tiene tema oscuro. Sus textos de demostración tampoco vuelven (ver «Textos aprobados»).

## 0. Antes de escribir código

1. Lee, en este orden:
   - `CLAUDE.md` (manda sobre todo lo demás);
   - en `docs/plan_mvp.md`: «Contrato de la API del bloque 4» → «Premium: Checkout, portal y pago simulado» y «Páginas», y la sección «Pulido» → «Pasada de diseño»;
   - en `docs/bitacora.md`: «Bloque 4 · Agente `frontend` sobre premium, gracias, pago simulado, perfil y cabecera» (su lista «Para la pasada de diseño» es este encargo) y «Pulido · Informe aprobado y documentación»;
   - `client/public/pages/premium.html`, `client/public/pages/fake-checkout.html`, `client/src/pages/premium.ts`, `client/src/pages/fake-checkout.ts`, `client/public/styles/components/premium-page.css` y `client/public/styles/components/fake-checkout.css`;
   - en la maqueta, las cuatro páginas y sus estilos.
2. **Propón el diseño antes de implementarlo y espera mi OK:**
   - la disposición de cada vista (oferta, espera, bienvenida y pago simulado) en móvil (360 px) y en escritorio (64rem o más), en ASCII o en una lista por zonas;
   - los componentes CSS que creas, divides o cambias;
   - **una tabla de valores maqueta → token**: cada margen, tamaño, peso, `letter-spacing`, radio, sombra, degradado y duración de la maqueta, con el token del proyecto que lo recoge (nuevo o existente) y su valor. Marca los que hoy no coinciden;
   - cada desvío de la maqueta y su motivo (por ejemplo, el área táctil de 44 px o un corte que no es 40rem ni 64rem).

   Si algo de este encargo choca con `CLAUDE.md` o con el contrato, dilo y pregunta. No elijas en silencio.

## 1. Qué construir

1. **Los valores exactos de la maqueta** en las cuatro vistas, según la tabla que apruebe. Hoy hay márgenes, tamaños, pesos y `letter-spacing` aproximados.
2. **La bienvenida como `welcome-card`** (maqueta: `premium/bienvenida/index.html`). En Koma es el estado final de `/premium/gracias` (D17 del bloque 4): no hay ruta `/premium/bienvenida`.
   - La tarjeta va centrada, con halo y con los destellos ✦ ✧ ✦. Son decorativos: `aria-hidden="true"`.
   - La mascota va girada como en la maqueta y con su animación de flotar. Toda animación se detiene con `prefers-reduced-motion: reduce`, como hoy `premium-page.css` hace con `.premium__mascot`.
   - El cambio de vista sigue igual: `premium.ts` muestra y oculta con `data-step` y escribe los textos de la bienvenida con `textContent` en `data-premium-eyebrow`, `data-premium-title`, `data-premium-title-accent` y `data-premium-lead`. Puedes mover y reagrupar el marcado, pero esos ganchos y su mecanismo se mantienen.
3. **Los iconos de escudo y tarjeta.**
   - Copia los símbolos `i-shield` e `i-credit` de la maqueta (están en línea en cualquiera de sus páginas) a `client/public/icons/sprite.svg`, como `icon-shield` e `icon-credit`, con el mismo `viewBox` y los mismos trazos que los demás símbolos del sprite.
   - Úsalos donde los usa la maqueta:
     - el escudo en el pie de la tarjeta del plan, en el distintivo de la espera, en la nota de la bienvenida, en el distintivo y en la nota del pago simulado;
     - la tarjeta en la cabecera de «Pago de prueba».
   - Sustituyen al candado y a la corona que se pusieron en su lugar. La corona se queda donde también la usa la maqueta.
4. **La mascota en WebP.**
   - `client/public/icons/koma-mascota-premium.webp` ya está en el repositorio (414 × 392, el mismo gato que saluda, sin pérdida y con transparencia).
   - Cambia el `src` en `premium.html` y conserva `width="414" height="392"`, `loading="lazy"` y el `alt`.
   - En `server/src/tests/api/pages.test.ts`, la comprobación `src="/icons/koma-mascota-premium.png"` pasa a `.webp`.
   - Borra `client/public/icons/koma-mascota-premium.png` después de comprobar con `rg` que nada más lo usa.
5. **Pago simulado:**
   - el ancho máximo desde 64rem, el de la maqueta;
   - la tarjeta ficticia con «TARJETA FICTICIA» y «NO VÁLIDA» en dos líneas, como la maqueta.

**Textos aprobados que no vuelven a los de la maqueta:**
- 5 € al mes (D16 del bloque 4) y «Koma Premium», con «Koma» y no «KOMA»;
- «Modo de prueba · Sin pagos reales», «Suscripción de prueba: …» y «Modo de prueba · sin cobros»;
- los botones según el rol («Regístrate para hacerte premium», «Entrar», «Hacerse premium» y «Gestionar suscripción»), y «Pagar», «Cancelar suscripción» y «Volver a Premium»;
- los textos de la espera y de la bienvenida que escribe `premium.ts`.

Si un texto de la maqueta te parece mejor, proponlo; no lo cambies.

**Sin tocar lo funcional.** Se mantienen tal como están:
- `data-view`, `data-for`, `data-step`, `data-plan-card`, `data-plan-error`, `data-premium-*`, `data-manage`, `data-pay`, `data-cancel`, `data-status`, `data-period` y `data-none-text`;
- el `role="status" aria-live="polite"` de la espera y los mensajes de resultado;
- el formulario `plan-card__actions` hacia `/api/payments/checkout` (oculto hasta que `premium.ts` decide);
- los enlaces sin JS (`/registro?next=…`, `/entrar?next=…`, `/perfil` y `/premium`);
- los avisos `<noscript>` y el foco tras cada acción.

## 2. Alcance de archivos

- **Puedes tocar:**
  - `client/public/pages/premium.html` y `client/public/pages/fake-checkout.html`;
  - `client/public/styles/components/premium-page.css` y `fake-checkout.css`, y los componentes nuevos que hagan falta, uno por bloque BEM (por ejemplo `welcome-card.css` o `plan-card.css`, si sacas de `premium-page.css` un bloque que no es suyo), enlazados en su HTML después de `breadcrumb.css`;
  - `client/public/styles/variables.css`: **solo añadir** tokens, con el prefijo de su componente (`--premium-*`, `--plan-card-*`, `--welcome-*` o `--checkout-*`);
  - `client/public/icons/sprite.svg`: **solo añadir** `icon-shield` e `icon-credit`;
  - `client/public/icons/koma-mascota-premium.png`: borrarlo (punto 4);
  - `server/src/tests/api/pages.test.ts`: solo la línea de la mascota y lo que el diseño cambie de verdad (justifícalo).
- **No toques:**
  - `client/src/` (ni `premium.ts` ni `fake-checkout.ts`). Si para el diseño hace falta cambiar algo del TS, dilo en la propuesta y espera;
  - los tokens que ya existen (cambiar uno compartido es del encargo E4), `layers.css` (si una capa es imprescindible, propónla) y los componentes compartidos: `button.css`, `breadcrumb.css`, `site-header.css`, `site-footer.css` y `mobile-nav.css`;
  - `/perfil` ni `profile-card.css`: su tarjeta de premium es del encargo E4;
  - `server/` (salvo el test de arriba), `layout.ts`, el resto de páginas, `docs/`, `CLAUDE.md`, `package.json` ni las dependencias.
- **Git lo maneja el usuario.** No hagas `git add`, `commit`, `push` ni ramas. Al terminar, entrega los comandos `git add` (y `git rm` para el PNG) y `git commit`, listos para copiar y sin líneas de firma. `.claude/` no va a ningún commit.

## 3. Reglas que no se negocian (de `CLAUDE.md`)

- HTML, CSS y TypeScript sin frameworks, sin bundler y sin dependencias nuevas. Ningún `any` ni `@ts-ignore`.
- Sin scripts ni estilos en línea, sin `style=` ni `on*=`: la CSP de helmet lo bloquea. Sin `innerHTML`.
- **CSS:**
  - mobile-first con `min-width: 40rem` y `64rem`, y ningún otro corte;
  - BEM, un archivo por componente;
  - **todo valor visual en `variables.css`**: colores, degradados, sombras, espacios, tamaños, radios, giros, desplazamientos y duraciones van como tokens, nunca literales en los componentes. Solo se admite la geometría interna de una composición (posiciones en % de los destellos o la trayectoria de una animación), con un comentario;
  - los `z-index` van en `layers.css`;
  - solo tema oscuro (ningún `prefers-color-scheme`) y fuentes del sistema;
  - `:focus-visible` visible y áreas táctiles de 44 px.
- HTML semántico que se entiende sin JS: un solo `<h1>` por vista, las imágenes con su `width` y su `height` reales y lo decorativo con `aria-hidden="true"`.
- Textos de la interfaz en español; el código, en inglés.

## 4. Lo que comprueban los tests

`server/src/tests/api/pages.test.ts` («Premium y pago simulado»). Mantén:
- **`/premium`:**
  - el `<title>` «Premium · Koma»;
  - un solo `h1`, cuyo texto sin etiquetas es «Más historias. Menos pausas.»;
  - `<body data-view="offer">` y el texto «5 €»;
  - `href="/registro?next=%2Fpremium"` y `href="/entrar?next=%2Fpremium"`;
  - exactamente `<form class="plan-card__actions" data-for="user" method="post" action="/api/payments/checkout" hidden>`;
  - ningún `{{`.
- **`/premium/gracias`:**
  - el `<title>` «Gracias · Koma» y un solo `h1`, «Estamos confirmando tu pago…»;
  - `<span class="breadcrumb__current" aria-current="page">Gracias</span>`;
  - algún `loading="lazy"`, `<body data-view="thanks">` y `role="status" aria-live="polite" data-premium-status`;
  - el `src` de la mascota (`.webp` tras tu cambio) y `href="/perfil"`.
- **`/pago-simulado`:**
  - el `<title>` «Pago simulado · Koma» y un solo `h1`, «Finaliza tu prueba.»;
  - un único `<input` en la página (el buscador de la cabecera);
  - `data-pay`, `data-cancel` y `href="/premium"`.

`server/src/tests/unit/`:
- en `layout.test.ts`, los marcadores `<!-- @head -->`, `<!-- @header -->` y `<!-- @footer -->` una vez cada uno, y `layers.css` enlazado entre `variables.css` y `base.css`;
- el test del tema: un solo `--color-bg` y ningún `prefers-color-scheme`;
- `no-any.test.ts`.

## 5. Comprobación

- **Tu sandbox no tiene red:** no puedes instalar paquetes, conectarte a Postgres ni ejecutar `npm run test:api` ni el servidor.
- Ejecuta `npm run typecheck` y `npm test` (deben pasar), y revisa tu diff con la lista de «Definición de terminado» de `CLAUDE.md`.
- Comprueba también:
  - que no queda ningún color literal en tus CSS: `rg -n "#[0-9a-fA-F]{3,8}\b|rgba?\(" client/public/styles/components`;
  - que cada token que añades se usa.
- Las pruebas de API y las del navegador (360 px, entre 40 y 64rem, desde 64rem, con teclado y con movimiento reducido) las hace el usuario:
  - la oferta, como invitado, como `reader@demo.test` y como `premium@demo.test`;
  - la espera y la bienvenida, pagando en `/pago-simulado` con el driver `fake`.

## 6. Entrega

1. Qué has hecho, en 5–8 líneas.
2. Los archivos tocados.
3. La tabla final de valores maqueta → token, con los desvíos.
4. La lista de lo que hay que mirar en el navegador.
5. Los comandos `git add`, `git rm` y `git commit` (formato `style(premium): … (RN-04)`).
6. Una entrada de bitácora propuesta, como texto, sin editar `docs/bitacora.md`.
