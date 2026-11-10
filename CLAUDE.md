# CLAUDE.md · Koma — plataforma de cómics

## Proyecto

**Koma**: plataforma de cómics estilo webtoon. MVP de punta a punta: un visitante encuentra una obra, la lee con límites según su rol, comenta una viñeta, paga premium en modo prueba, y un admin aprueba contenido y audita cada acción sensible. Especificaciones completas en `docs/`.

- Bloque actual: **5 · Fase 2 seleccionada (10 – 15 nov)**: CU-39 con vista de impresión, punto de abandono, Open Graph y enlace de Discord. Actualizar esta línea al cambiar de bloque (calendario en `docs/plan_mvp.md`).
- Stack: Node 24 LTS, Express 5, TypeScript estricto sin any (ESM, module: NodeNext), PostgreSQL con SQL a mano (`pg`), zod 4, HTML/CSS/TS sin frameworks. Un solo `package.json` en la raíz (`"type": "module"`, `engines.node: ">=24.2 <25"`: `import.meta.main` exige 24.2).

## Comandos

| Comando | Qué hace |
| --- | --- |
| `docker compose up -d db` | Levanta solo Postgres (desarrollo diario; la app corre en el host) |
| `npm run watch` · `npm run dev` | `tsc -b --watch` (terminal 1) · `node --watch --env-file=.env server/dist/server.js` (terminal 2; ejecuta lo compilado) |
| `npm run build` / `npm run typecheck` | `tsc -b` (raíz con referencias a `server/` y `client/`); compilar es comprobar tipos |
| `npm start` · `npm run migrate` | `node server/dist/server.js` (online; aplica migraciones al arrancar) · solo las migraciones pendientes |
| `npm run seed` · `npm run content:import` (y `seed:online` · `content:import:online`) | Cuentas demo, etiquetas base, anuncios y `settings` · importa `content/` (RN-18; requiere `migrate`). `:online` se ejecuta desde local hacia Neon + R2 con `--env-file=.env.online` (ignorado por git y Docker) e imprime al empezar el host de la BD y `STORAGE_DRIVER` |
| `npm run demo:data` | Datos de demostración para el panel del autor (obras, lecturas y comentarios); solo BD local: aborta si no lo es |
| `npm test` | `tsc -b && node --test "server/dist/tests/unit/**/*.test.js"` (funciones puras) |
| `npm run test:api` | `tsc -b && node --env-file=.env --env-file=.env.test server/dist/scripts/reset-test-db.js && node --env-file=.env --env-file=.env.test --test "server/dist/tests/api/**/*.test.js"` (reinicia `koma_test`) |
| `docker compose up` | App + BD en contenedores (respaldo de la demo sin internet) |

- Tests en `server/src/tests/unit/` y `server/src/tests/api/`, archivos `<tema>.test.ts`; el nombre de cada test empieza por su RN (`'RN-02: recarga 2 por periodo'`) o, si no tiene, por `'Seguridad:'`. Un solo test: `npm run build && node --test server/dist/tests/unit/<tema>.test.js`, o filtrar con `--test-name-pattern="RN-02"`.
- Pruebas de API: BD `koma_test` (`.env.test` solo sobrescribe `DATABASE_URL`); `reset-test-db.ts` hace `DROP SCHEMA` + migraciones + seed y aborta si la BD no termina en `_test`. Usan `startTestServer()` de `tests/api/helpers.ts`: importa `app` de `app.ts`, `listen(0)` en `before()` y cierra servidor y pool en `after()`.
- Cuentas demo: `admin@`, `author@`, `premium@`, `reader@demo.test`; contraseñas en `docs/credenciales.local.md` (ignorado por git).

## Estructura

```
├── package.json · tsconfig.json (referencias) · docker-compose.yml (db, app) · Dockerfile · .dockerignore · docker/initdb/ · .env.example · .env.test · README.md · .claude/ (auditor, frontend, constructor)
├── server/src/
│   ├── app.ts · server.ts      # server.ts → server/dist/server.js
│   ├── modules/                # auth, users, comics, chapters, reading (RN-01–03, anuncios), comments, payments, audit, admin
│   │   └── auth/permissions.ts # ÚNICO archivo con las reglas de permisos
│   ├── middlewares/            # request-id, trailing-slash, auth, roles, rate-limit, validate, upload, csrf, error-handler
│   ├── integrations/           # misma interfaz por driver: storage (local | r2), payments (fake | stripe)
│   ├── db/                     # pool.ts (pool, withTransaction, Queryable), migrations/ (001_users … 009_billing), seeds/
│   ├── scripts/                # migrate.ts, seed.ts, import-content.ts, reset-test-db.ts, demo-data.ts, demo-guard.ts y demo-png.ts (solo local)
│   ├── config/                 # env.ts (valida variables con zod al arrancar; si falta una, termina), paths.ts, limits.ts (valores fijos del plan)
│   ├── utils/                  # logger.ts (una línea JSON por evento), app-error.ts, html.ts (escapeHtml, fillTemplate), origin.ts (CSRF), password.ts (RN-12), page.ts (sendPage), layout.ts (head, cabecera y pie), redirect.ts (next), image.ts (firma y medidas de imagen), signing.ts (HMAC por uso), text.ts (regla común de textos), open-graph.ts (meta Open Graph)
│   └── tests/                  # unit/ y api/: <tema>.test.ts
├── client/
│   ├── public/                 # pages/<página>.html, errors/<código>.html, styles/ (variables.css, layers.css, base.css, components/), icons/ (favicon.svg, sprite.svg, logo, ilustraciones de error, mascota de premium e imagen Open Graph (`koma-og.png`))
│   └── src/                    # TS → client/dist, servido en /js
│       ├── pages/              # home, comic, reader, auth, profile, premium, fake-checkout, author, admin
│       ├── components/         # header, comic-card, comment-panel, ad, timer
│       ├── services/           # api.ts (todas las peticiones), auth.ts
│       └── utils/              # validate.ts, redirect.ts, catalog.ts, fullscreen.ts, ratio.ts
├── content/ · storage/         # obras a importar · imágenes del driver local (ignorados por git)
└── docs/                       # plan_mvp.md, modelo_datos.md, ideas_base.md, casos_de_uso.md, bitacora.md
```

Recorrido de una petición (archivos `<módulo>.<capa>.ts`: `comics.routes.ts`, `comics.schema.ts`… `comics.repository.ts`):
1. `routes`: método, ruta y middlewares (`auth`, `requireAuth`/`requireAdmin`/`requireAuthor`, `rateLimit`, `upload`).
2. `schema`: zod valida `body`, `params` y `query` → 400; lo validado va a `res.locals`.
3. `controller`: traduce HTTP ↔ servicio; sin lógica.
4. `service`: reglas RN y propiedad; lanza solo `AppError`. Si hay auditoría, `withTransaction(async (client) => …)` (`BEGIN`/`COMMIT`; `ROLLBACK` y relanza si falla; `release()` en `finally`) y el mismo `client` para el cambio y para `audit`.
5. `repository`: único lugar con SQL (parametrizado); recibe como primer parámetro un `Queryable` (`Pool | PoolClient`: `pool` o el `client` de la transacción); convierte snake_case ↔ camelCase.
6. `error-handler`: decide código y formato de cualquier error.

- Un solo servidor Express: API en `/api/*`; `express.static` solo para `/styles` e `/icons` (de `client/public`) y `/js` (`client/dist`). Los HTML salen siempre por el mapa de rutas (comprobaciones, theme-color, cabecera, pie y página activa de `layout.ts` con los marcadores `<!-- @head -->`, `<!-- @header -->` y `<!-- @footer -->`, y `<!-- @community -->` solo en `home.html`, e inyección de `requestId`), nunca por `express.static`.
- Cada página = `client/public/pages/<página>.html` + `client/src/pages/<página>.ts`, cargado con `<script type="module" src="/js/pages/<página>.js">`. Una página solo informativa (`become-author`) no lleva `.ts`.
- El permiso de lectura de un capítulo lo decide la API, no la ruta HTML: la página carga y la API devuelve capítulo, anuncio, invitación a registrarse o muro de límite.
- Local y online son el mismo código; solo cambian `STORAGE_DRIVER` y `PAYMENTS_DRIVER`. `env.ts` rechaza `PAYMENTS_DRIVER=fake` con `NODE_ENV=production`.
- Toda novedad de premium pasa por `syncSubscription(subscriptionId)` (RN-04); el driver `fake` llama al mismo servicio.

## No haremos

- Frameworks de frontend (React, Vue…), bundler, frameworks CSS (Bootstrap, Tailwind), ORM (Prisma, Sequelize…), microservicios ni WebSockets.
- Depender de internet el día de la presentación (ni fuentes, scripts o estilos desde CDN o servicios externos); redes públicas o desconocidas ni HTTPS en local (la demo local es en la LAN de confianza, `http://koma.local`).
- Pagos reales (online, Stripe solo en modo prueba) ni guardar datos de tarjeta; el driver `fake` nunca en producción (`env.ts` lo rechaza); anuncios reales (solo marcas inventadas).
- Imágenes con URL pública permanente; alojar vídeos; borrado físico desde la interfaz (salvo viñetas de un borrador); internacionalización.
- Verificación de identidad real ni contenido +18 real; obras con licencia NC; APK o apps nativas antes de la entrega.
- **Nada de las fases 2 y 3**, salvo lo aprobado para el bloque 5 (lista cerrada en `docs/plan_mvp.md`, "Fase 2 · bloque 5"): ni carpetas, ni tablas, ni rutas, ni dependencias.
- Dependencias: solo las del stack de `docs/ideas_base.md` (`express`, `zod`, `bcrypt`, `jsonwebtoken`, `cookie-parser`, `multer`, `helmet`, `express-rate-limit`, `pg`, `stripe`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`; en desarrollo `typescript` y tipos). Ninguna otra sin aprobación; sin dotenv (`--env-file` nativo).

## Convenciones

- Código, tablas, nombres de archivo y rutas de la API en inglés; textos de interfaz, URLs de páginas (`/obra/:slug`, `/leer/:slug/:numero`) y mensajes de error en español.
- BD en snake_case, JSON en camelCase. Claves `INTEGER GENERATED ALWAYS AS IDENTITY` (`audit_log`: `BIGINT`). Borrado siempre lógico (`deleted_at`, `hidden_at`), salvo viñetas de un capítulo en `draft`. Valores numéricos en constantes o en la tabla `settings`, nunca dispersos.
- Git y GitHub los maneja solo el usuario. Nunca ejecutes `git add`, `commit`, `push` ni nada que modifique el repositorio; al cerrar cada tarea, entrega los comandos `git add` y `git commit` listos para copiar. Puedes usar `git status` y `git diff` para leer. "Haz un commit" significa "dame los comandos". Commits en español con prefijo y regla: `feat(reading): saldo global (RN-02)`.
- Acciones de auditoría `entidad.verbo`, solo con los nombres exactos de la tabla de auditoría del plan.
- Errores: los servicios lanzan solo `new AppError(404, 'NOT_FOUND', 'La obra no existe')`, con los `code` de la tabla del plan. `/api/*` responde JSON `{ code, message, fields?, retryAt?, requestId }`; las páginas responden HTML con el mismo código, nunca 200 con un error.
- `requestId` (`crypto.randomUUID()`) va en `X-Request-Id`, en cada log, en la auditoría y en la respuesta de error; los scripts generan el suyo.
- Cliente: peticiones solo por `services/api.ts` (`ApiResult<T>`, nunca lanza por errores HTTP); formularios con `bindForm(form, rules, onSubmit)`; un `store` mínimo por página; sesión desde `GET /api/me`; preferencias de interfaz (advertencias aceptadas, ocultar iconos) en `localStorage` con `try/catch`, nunca permisos ni límites. zod en el servidor es la fuente de verdad; el cliente duplica sus constantes de forma explícita.
- HTML semántico que se entiende sin JS: `<title>` `Koma` o `<página> · Koma`, un solo `<h1>`, `header`/`nav`/`main`/`footer`, enlace "Saltar al contenido", `lang="es"`, `loading="lazy"` salvo en las imágenes de la primera pantalla, `<link rel="icon" href="/icons/favicon.svg">`.
- CSS mobile-first (`min-width: 40rem` y `64rem`), BEM, un archivo por componente, todo valor visual en `variables.css` (el diseño lo sustituye sin tocar HTML, TS ni componentes; única excepción: el `<meta name="theme-color">` de `layout.ts`, que repite `--color-bg` y un test lo compara) y `z-index` en `layers.css`, solo tema oscuro (`color-scheme: dark`, sin tema claro: es una plataforma de lectura), fuentes del sistema, `:focus-visible` y áreas táctiles de 44 px.
- `ILIKE` escapa `%` y `_`; el orden dinámico usa lista blanca de columnas. Antes de redirigir al login, el cliente guarda el fragmento `#v-n`.
- Las redirecciones internas son relativas (`Location: /ruta`); `APP_URL` solo se usa para URLs absolutas que salen de la app: retorno de Stripe y meta Open Graph (`og:url`, `og:image`).

## Trampas conocidas

- **Express 5:** comodines con nombre (`/*splat`, no `*`); `req.query` es de solo lectura (lo validado va a `res.locals`); los errores `async` se propagan solos.
- **zod 4:** API de la v4 (`z.email()`, `error` en lugar de `message`, `z.flattenError()`); no copiar ejemplos de zod 3.
- **ESM:** sin `__dirname` ni `require`; `import.meta.dirname` e imports con extensión `.js`, también en el cliente.
- **Sin bundler:** nada de `node_modules` (zod incluido) llega al cliente; `tsc` no copia CSS ni HTML (viven ya en `client/public/`).
- **Stripe:** `apiVersion` fijada en el constructor; `current_period_end` está en `subscription.items.data[0]`, no en la suscripción; el webhook usa `express.raw()` registrado antes de `express.json()`.
- **R2 con AWS SDK v3:** `region: 'auto'`, endpoint `https://<account>.r2.cloudflarestorage.com`, `requestChecksumCalculation: 'WHEN_REQUIRED'` y `responseChecksumValidation: 'WHEN_REQUIRED'`.
- **`trust proxy`:** número de saltos (`TRUST_PROXY`), nunca `true` (RN-13).
- **bcrypt:** límite de 72 bytes (`Buffer.byteLength`), no caracteres (RN-12).
- **Neon:** SSL obligatorio con `sslmode=verify-full` (con `require`, `pg` 8 avisa de que cambiará en la v9); migrar por la conexión directa, no la agrupada (`-pooler`).
- **Render:** build con `npm ci --include=dev` o falta `typescript`; disco efímero (imágenes en R2); sin *pre-deploy*: las migraciones corren al arrancar.

## Seguridad obligatoria

- Permisos calculados en el servidor en cada petición con el usuario leído de la BD (`status`, `token_version`), nunca solo del JWT. La propiedad se comprueba en el servicio; el frontend solo oculta botones.
- SQL siempre parametrizado (`$1, $2`), nunca concatenado.
- La auditoría va en la misma transacción que el cambio; `audit_log` es solo inserción (triggers contra UPDATE, DELETE y TRUNCATE). Nunca contraseñas, hashes, tokens ni datos de pago en `before`/`after`.
- CSRF: toda petición que modifica datos exige un `Origin` de `ALLOWED_ORIGINS` (por defecto, el origen de `APP_URL`; si no, 403 `CSRF`); solo el webhook de Stripe queda exento (se valida por firma). Ningún GET modifica datos. `next` (`safeNext`, `utils/redirect.ts`) solo acepta rutas que empiezan por `/`; rechaza las que empiezan por `//` o `/\` y las que contienen caracteres de control.
- Datos de usuario escapados al inyectarse en HTML (servidor) y pintados con `textContent` (cliente). Sin scripts en línea; CSP de helmet directiva a directiva.
- JWT en cookie `httpOnly`, `SameSite=Lax`, `Secure` según `COOKIE_SECURE`; nada sensible en `localStorage`.
- Imágenes siempre con URL firmada. Subidas comprobadas por firma de archivo, multer en disco, claves `UUID.ext` generadas por el servidor; `/files/:key` valida la clave con `^[0-9a-f-]{36}\.(jpg|png|webp)$` antes de tocar el disco.

## Cuándo leer `docs/`

- Antes de tocar una regla → su RN en `docs/plan_mvp.md` ("Reglas de negocio").
- Antes de una tabla, migración o seed → `docs/modelo_datos.md` (DDL, índices, triggers y seeds por bloque).
- Antes de una ruta → "Mapa de rutas HTML" y el contrato de API del bloque. Si el contrato del bloque aún no está escrito, pedirlo.
- Antes de un caso de uso → `docs/casos_de_uso.md` (comprobar su fase).
- Antes de añadir una dependencia, carpeta o módulo → stack y estructura en `docs/ideas_base.md`; cada idea aprobada lleva su fase.
- Errores, auditoría, importación de `content/` y variables de entorno → su sección en `docs/plan_mvp.md`.
- **Si algo no está especificado, preguntar antes de implementarlo.**
- Si este archivo y `docs/` se contradicen, avisar y preguntar; no elegir en silencio.

## Definición de terminado

Antes de cada commit, revisar el diff:
- [ ] Cada ruta nueva tiene el middleware de permisos que le corresponde.
- [ ] SQL parametrizado; nada concatenado.
- [ ] Datos de usuario escapados (servidor) o con `textContent` (cliente).
- [ ] Las acciones sensibles escriben en `audit_log` en la misma transacción.
- [ ] Sin dependencias, carpetas ni tablas fuera del plan.

Un bloque está cerrado solo cuando:
- [ ] `npm run typecheck` sin errores.
- [ ] Funciona en local y desplegado online.
- [ ] Tests de sus RN (cada RN con cálculo tiene ejemplos) y pruebas de API en verde.
- [ ] Diff revisado con la lista anterior.
- [ ] Revisado en móvil (360 px) y escritorio, con teclado.
- [ ] Sin errores en la consola del navegador ni en los logs.
- [ ] Sus acciones sensibles aparecen en la auditoría.
- [ ] Variables nuevas en `.env.example` y en el README.
- [ ] Entrada del bloque en `docs/bitacora.md`.

Agente `frontend` (`.claude/agents/frontend.md`): revisa el cliente frente a CLAUDE.md, `docs/` y la maqueta `koma_home`.
- Alcance: `client/public`, `client/src`, `layout.ts`, `page.ts` y las plantillas de error; la seguridad del servidor y las RN siguen siendo del `auditor`.
- Solo lectura: no modifica archivos; informa de hallazgos (archivo, línea, gravedad, corrección propuesta) y de lo que hay que mirar a mano en el navegador.
- Se ejecuta al terminar cada página o conjunto de páginas integradas, y antes del `auditor` del cierre del bloque.
