---
name: constructor
description: Construye el proyecto siguiendo CLAUDE.md y docs/. Si el andamiaje no existe, lo crea primero (estructura, configuración, migraciones base, seeds y páginas de error) antes de cualquier funcionalidad. Uso - /constructor andamiaje | bloque N | <tarea>.
argument-hint: "[andamiaje | bloque N | tarea concreta]"
disable-model-invocation: true
---

# Constructor

Tarea pedida: $ARGUMENTS

## Reglas

- `CLAUDE.md` manda; `docs/` es la especificación. Si algo falta o se contradice, para y pregunta. No elijas en silencio.
- Cada tarea es un cambio pequeño y verificable.
- Git y GitHub los maneja solo el usuario. Nunca ejecutes `git add`, `commit`, `push` ni nada que modifique el repositorio; al cerrar cada tarea, entrega los comandos `git add` y `git commit` listos para copiar. Puedes usar `git status` y `git diff` para leer. "Haz un commit" significa "dame los comandos".
- Una afirmación como "funciona" o "pasa" solo vale si ejecutaste el comando en esta sesión. Si no lo ejecutaste, di que está sin verificar.
- Las migraciones ya aplicadas no se editan: se crea una nueva.
- En `docs/` solo puedes tocar tres cosas: las versiones exactas en `ideas_base.md` (Stack), los contratos de API en `plan_mvp.md` (con aprobación previa) y `bitacora.md`.

## Paso 0: estado

1. Si no existe `package.json`, la tarea es el **andamiaje**, sea cual sea la pedida. Avisa al usuario.
2. Lee la línea "Bloque actual" de `CLAUDE.md`, `git status` y la última entrada de `docs/bitacora.md`.
3. Si la tarea no pertenece al bloque actual o es de fase 2 o 3, avisa y espera.

## Modo andamiaje

Trabaja en este orden. Al terminar cada fase, muestra un resumen de 5 líneas como máximo con el resultado de su comprobación y espera el OK antes de seguir.

### Fase A · Proyecto y configuración

1. Si no hay repositorio, pide al usuario que ejecute `git init`; crea `.gitignore` con la lista de `docs/ideas_base.md`.
2. Crea `package.json` con `"type": "module"`, `"engines": { "node": ">=24.2 <25" }` y los scripts exactos de la tabla de comandos de `CLAUDE.md`.
3. Instala las dependencias con `npm install --save-exact`, solo las de la lista de `CLAUDE.md`. En desarrollo: `typescript`, `@types/node` y los `@types/*` de cada dependencia que no traiga tipos. Copia las versiones instaladas a la sección Stack de `docs/ideas_base.md`.
4. Crea la configuración de TypeScript:
   - `tsconfig.json` raíz, solo con `references` a `server` y `client`.
   - `server/tsconfig.json` y `client/tsconfig.json` con `strict`, `composite`, `module`/`moduleResolution: NodeNext`, `rootDir: src` y `outDir: dist`.
   - En el cliente, además, `lib: ["ES2023", "DOM", "DOM.Iterable"]`.
5. Crea los archivos de Docker:
   - `docker-compose.yml` con dos servicios:
     - `db`: Postgres de la misma versión mayor que Neon (si no se sabe, pregunta). Usa un volumen con nombre, un `healthcheck` y monta `docker/initdb/`.
     - `app`: construido desde el `Dockerfile`, con `depends_on: db (service_healthy)`, `DATABASE_URL` apuntando al host `db`, `HOST=0.0.0.0` y un volumen para `storage/`.
   - `Dockerfile` con `node:24-slim`, `npm ci --include=dev`, `npm run build` y `npm start`.
   - `.dockerignore` que excluya `node_modules`, `dist`, `.env`, `.env.online`, `docs/credenciales.local.md`, `storage` y `content`.
   - `docker/initdb/01-test-db.sql` con `CREATE DATABASE koma_test;`.
6. Crea los archivos de entorno:
   - `.env.example`, copiado del plan.
   - `.env.test`, con solo `DATABASE_URL` hacia `koma_test`.
   - `.env`, copiado de `.env.example` y sin versionar. Genera secretos aleatorios para `JWT_SECRET` y `COOKIE_SECRET`.
   - `docs/credenciales.local.md`, con la plantilla de las 4 cuentas demo, sin versionar.

**Comprobación:** `npm run build` termina sin errores y `git status` no muestra `.env` ni `credenciales.local.md`.

### Fase B · Núcleo del servidor

1. `config/env.ts`: valida con zod 4 todas las variables de `.env.example`. Rechaza `PAYMENTS_DRIVER=fake` cuando `NODE_ENV=production`. Si falta una variable, termina con un mensaje claro.
2. `utils/logger.ts` (una línea JSON por evento) y `utils/app-error.ts`.
3. `db/pool.ts`: exporta `pool`, `type Queryable = Pool | PoolClient` y `withTransaction`, según la definición del plan.
4. Middlewares: `requestId` (cabecera `X-Request-Id`), `csrf` (por `Origin`) y `error-handler` (JSON en `/api/*`, página HTML en el resto, conservando el código).
5. `app.ts`: monta todo sin `listen` ni migraciones, porque los tests lo importan.
   - helmet con CSP directiva a directiva.
   - `express.static` solo para `/styles`, `/icons` y `/js`.
   - `cookie-parser`, `express.json()` y `trust proxy` desde `TRUST_PROXY`.
   - `GET /api/health`.
6. `server.ts`: migra, escucha y registra `unhandledRejection` y `uncaughtException`.

**Comprobación:** con `docker compose up -d db` y `npm run dev`, `curl -i localhost:3000/api/health` devuelve 200 con `X-Request-Id`.

### Fase C · Base de datos y seeds

1. `scripts/migrate.ts`: aplica `db/migrations/*.sql` en orden numérico, cada una en su transacción, y las registra en `schema_migrations`.
2. Migraciones `001_users`, `002_settings` y `003_audit_log`, copiadas de `docs/modelo_datos.md`. Los triggers bloquean UPDATE, DELETE y TRUNCATE.
3. `scripts/seed.ts`, según la sección Seeds de `docs/modelo_datos.md`: idempotente (`ON CONFLICT`), con su propio `request_id`. Crea las 4 cuentas demo (contraseñas desde `SEED_*_PASSWORD`) y los `settings` por defecto de RN-16. Solo siembra tablas que ya existen; la parte de etiquetas y anuncios se añade cuando lleguen sus migraciones (bloque 2).
4. `scripts/reset-test-db.ts`, según el plan. Aborta si la base no termina en `_test`.

**Comprobación:**
- `migrate` y `seed` se ejecutan dos veces sin error y sin duplicados.
- `DELETE FROM audit_log` falla.
- `TRUNCATE audit_log` también falla.

### Fase D · Cliente base

1. `client/public/styles/`: `variables.css` (tokens y modo oscuro) y `base.css` (reset, foco visible y enlace "Saltar al contenido").
2. `client/public/icons/favicon.svg` y `client/public/errors/{403,404,410,500,503}.html`, con el marcador `{{requestId}}`. La página genérica de `error-handler` (400, 401, 413, 415, 429…) pasa a usar el mismo layout (cabecera, pie, "Saltar al contenido" y estilos).
3. `client/public/pages/home.html` mínimo y `client/src/pages/home.ts`.
4. `client/src/services/api.ts`, con `ApiResult<T>`.
5. Mapa de rutas con solo `/`, la barra final (301) y el 404. El servidor inyecta `requestId` en las páginas de error escapándolo.

**Comprobación:**
- `/` carga sin errores en la consola ni violaciones de CSP.
- `/no-existe` responde 404 con su página.
- `/pages/home.html` no se sirve directamente.

### Fase E · Tests, README y cierre

1. Test unitario `tests/unit/redirect.test.ts` para la validación de `next`, con los casos `/`, `/perfil`, `//evil`, `/\evil.com` (el navegador trata `\` como `/`) y `https://x`. Como no tiene RN, el nombre de cada test empieza por `'Seguridad:'`.
2. Test de API `tests/api/health.test.ts`.
3. `README.md` con requisitos, arranque local paso a paso, comandos y variables.
4. Entrada en `docs/bitacora.md`.

**Comprobación:** `npm run typecheck`, `npm test` y `npm run test:api` pasan.

**Fin del andamiaje:** pide al usuario que ejecute el agente `auditor` con el alcance "andamiaje". No empieces la API del bloque 1 sin su aprobación.

## Modo tarea (después del andamiaje)

1. **Localizar.** Identifica el CU, las RN, las tablas (`docs/modelo_datos.md`), las rutas y el contrato en `docs/`. Si el contrato de API del bloque no está escrito, redáctalo en `plan_mvp.md` y espera su aprobación.
2. **Planificar.** Lista los archivos que vas a crear o tocar, las RN afectadas y los tests. Si la tarea toca más de 5 archivos o incluye una migración, espera el OK.
3. **Construir** en este orden: migración → repository → service y sus tests unitarios de RN → schema → controller → routes → cliente.
4. **Verificar.** Ejecuta `npm run typecheck`, `npm test` y `npm run test:api`, y haz una prueba manual con `curl` o el navegador.
5. **Autorrevisar** con la lista de revisión del diff de `CLAUDE.md`.
6. **Entregar:**
   - Qué se hizo, en 3–5 líneas.
   - Los comandos para probarlo.
   - El mensaje de commit sugerido, con el formato `feat(módulo): … (RN-xx)`.
   - La entrada de bitácora propuesta.
   - Al cerrar un bloque, recuerda ejecutar el `auditor`.
