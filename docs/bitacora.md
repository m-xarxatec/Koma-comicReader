# Bitácora de vibecoding · Koma — plataforma de cómics

Una entrada por bloque (o por sesión relevante). Máximo ~10 líneas.

## Plantilla

### AAAA-MM-DD · Bloque N · Tarea
- **Pedido a la IA:** qué se pidió y con qué contexto (RN, CU, sección del plan).
- **Resultado:** qué generó.
- **Fallos:** qué estaba mal (permisos, SQL, versión antigua de una librería…).
- **Corrección:** qué se cambió a mano o qué instrucción se añadió a CLAUDE.md.
- **Aprendizaje:** regla nueva para la próxima sesión.

## Entradas

### 2026-10-30 · Bloque 0 · Planificación
- **Pedido a la IA:** dos auditorías del plan y resolución de sus preguntas.
- **Resultado:** plan, ideas y casos de uso actualizados; guía para CLAUDE.md.
- **Aprendizaje:** especificar antes de generar; lo no especificado la IA lo decide a su manera.

### 2026-11-01 · Bloque 1 · Demo local en la LAN de confianza (andamiaje, fase B)
- **Pedido a la IA:** sustituir la decisión "sin LAN": demo en `http://comics.local` (mDNS, puerto 80) y CSRF con `ALLOWED_ORIGINS`; docs, configuración, código y tests.
- **Resultado:** `env.ts` valida `ALLOWED_ORIGINS` (orígenes exactos; por defecto, el de `APP_URL`); `csrf` compara contra la lista; Compose publica `80:3000` y Postgres en `127.0.0.1`; README con "Demo en la LAN"; tests unitarios y de API del control de origen.
- **Fallos:** helmet enviaba HSTS siempre, también sobre `http`; `npm run test:api` aún no puede ejecutarse (falta `reset-test-db`, fase C).
- **Corrección:** HSTS y `upgrade-insecure-requests` solo cuando `APP_URL` es `https`.
- **Aprendizaje:** un cambio de decisión se busca en todos los docs (`rg`) antes de editar; un origen se compara exacto, como lo envía el navegador.

### 2026-11-01 · Bloque 1 · Cierre de la fase B del andamiaje
- **Pedido a la IA:** aplicar las respuestas de la fase B y comprobarla (`npm run dev` + `curl` a `/api/health`).
- **Resultado:** COOP desactivado sobre `http`, igual que HSTS; 413 `PAYLOAD_TOO_LARGE` para cuerpos de más de 100 kB; `seed:online` y `content:import:online` con `.env.online`; plan C (IP en `ALLOWED_ORIGINS`) en el README; contingencia 3 actualizada. `/api/health` → 200 con `X-Request-Id`, escuchando solo en `127.0.0.1`.
- **Fallos:** helmet enviaba COOP sobre `http`, y Chrome lo avisa en la consola; un cuerpo grande devolvía `FILE_TOO_LARGE`.
- **Reglas nuevas:** git y GitHub solo los maneja el usuario (CLAUDE.md y constructor); redirecciones internas relativas, `APP_URL` solo para URLs absolutas salientes.
- **Aprendizaje:** las cabeceras que solo valen en contexto seguro van ligadas a HTTPS; cada código de error, con un único significado.

### 2026-11-01 · Bloque 1 · Renombrado de la plataforma a Koma
- **Pedido a la IA:** renombrar la plataforma a Koma: textos visibles, títulos de docs, `package.json`, `koma.local` en la demo y BD local `koma` / `koma_test`; sin tocar la tabla ni el módulo `comics` ni las rutas `/obra` y `/leer`.
- **Resultado:** reemplazos sobre listas de archivos explícitas; `<title>` "Koma" o "<página> · Koma" anotado en las convenciones (la fase D lo aplica en cabecera y pie); página de error genérica con "· Koma".
- **Fallos:** el patrón de búsqueda no veía `POSTGRES_USER`, el `healthcheck` ni los archivos ignorados por git (`.env`).
- **Corrección:** segunda búsqueda amplia (`comics|cómics`, `--no-ignore`) y clasificación de lo que se queda (tabla, módulo, entradas antiguas de esta bitácora).
- **Aprendizaje:** un renombrado se busca también en lo que git ignora; la historia de la bitácora no se reescribe.

### 2026-11-01 · Bloque 1 · Auditoría del andamiaje (fases A y B) y correcciones
- **Pedido a la IA:** pasar el `auditor` sobre todo lo hecho y aplicar las respuestas del desarrollador.
- **Resultado:** apto con observaciones; sin hallazgos bloqueantes.
  - body-parser: 400 → `VALIDATION_ERROR` y 415 → nuevo `UNSUPPORTED_MEDIA_TYPE`, con tests de API.
  - `system.seed` en la tabla de acciones del plan y en `modelo_datos.md`.
  - Prefijo `'Seguridad:'` documentado; árboles de estructura completados; `git init` en el constructor pasa al usuario.
- **Fallos:**
  - Los 4xx de body-parser (charset o encoding no admitidos) acababan en 500 `INTERNAL_ERROR`.
  - Si Docker crea `storage/`, es de root y la app no puede escribir.
- **Corrección:**
  - El desarrollador simplificó el README a propósito: solo se corrigieron el orden `build` → `migrate`, la URL de la demo en Docker y `mkdir -p storage`.
  - "Demo en la LAN" y el plan C (citados en las entradas anteriores como README) pasan al "Checklist del día de la demo" del plan, con lista de comandos.
- **Aprendizaje:** un archivo que cambia en disco sin que lo edite la IA se toma como decisión del desarrollador: se pregunta, no se revierte.

### 2026-11-01 · Bloque 1 · Andamiaje, fase C (base de datos y seeds)
- **Pedido a la IA:** migraciones 001–003, `seed.ts` del bloque 1 y `reset-test-db.ts` (constructor, fase C).
- **Resultado:**
  - Migraciones idénticas al DDL de `modelo_datos.md`.
  - Seed idempotente en una transacción, con `system.seed` por fila creada; valida las contraseñas `SEED_*` con RN-12 antes de crear nada.
  - `reset-test-db` comprueba `current_database()` y se niega fuera de `_test`.
  - `npm run test:api` pasa por primera vez (7/7).
- **Comprobación:** migrate y seed dos veces sin duplicados (4 usuarios, 3 settings, 7 auditorías); DELETE, TRUNCATE y UPDATE de `audit_log` fallan.
- **Aprendizaje:** el seed no pisa cuentas existentes: cambiar una contraseña `SEED_*` no afecta a una BD ya sembrada.

### 2026-11-01 · Bloque 1 · Andamiaje, fase D (cliente base)
- **Pedido a la IA:** estilos base, favicon, páginas de error, `home`, `api.ts` y mapa de rutas con `/`, la barra final y el 404 (constructor, fase D).
- **Resultado:**
  - Tokens con modo oscuro, reset con foco visible y "Saltar al contenido", y un CSS por componente (cabecera, pie y página de error).
  - Las 5 páginas de error y la genérica del servidor comparten layout.
  - `sendPage` y `fillTemplate` inyectan el `requestId` escapado.
  - La barra final redirige con 301 a una ruta relativa y conserva la query.
- **Fallos:** un test daba por peligrosa la barra invertida codificada (`/%5Cevil.com`), que es segura; la literal no llegaba a probarse porque `fetch` la normaliza.
- **Corrección:** el test comprueba que la redirección nunca cambia de origen y envía la ruta tal cual con `node:http`.
- **Aprendizaje:** quitar una barra final puede abrir una redirección a otro sitio (`//evil.com/`): se valida el destino, no solo el origen.

### 2026-11-01 · Bloque 1 · Andamiaje, fase E (tests, README y cierre) y correcciones de la auditoría
- **Pedido a la IA:** aplicar la segunda auditoría y cerrar el andamiaje: test de `next`, test de `/api/health`, README con comandos y variables.
- **Resultado:**
  - Cabeceras y engines: `Referrer-Policy: same-origin` con test; `engines` `">=24.2 <25"` por `import.meta.main`.
  - Código y tests: `safeNext` (`utils/redirect.ts`) con su test; `/api/health` probado con 200 y con 503 sin BD.
  - Docs: `NETWORK_ERROR` en el plan; README con "Comandos" y "Variables" en el estilo del desarrollador.
- **Fallos:** el `no-referrer` de serie de helmet hacía que un formulario POST enviara `Origin: null` (en Brave: formulario → 403 `CSRF`; `fetch` → aceptado). La IA supuso que también afectaba a `fetch`, y no era así: solo se anula sin modo CORS.
- **Corrección:** `referrerPolicy: 'same-origin'`. Un test olvidaba cerrar el pool (10 s de espera): helper común `tests/api/helpers.ts` que cierra servidor y pool en `after()`.
- **Aprendizaje:** las cabeceras de seguridad por defecto pueden romper otra defensa; se prueban en un navegador real, no solo con tests que fijan `Origin` a mano.

### 2026-11-01 · Bloque 1 · Tarea 1: API de autenticación (CU-07, CU-08, RN-12, RN-13, RN-15)
- **Pedido a la IA:** `register`, `login`, `logout` y `me` según el contrato; middlewares `auth`, roles y límites; `permissions.ts`; auditoría.
- **Resultado:**
  - Módulos `auth`, `users` y `audit`; JWT HS256 `{ sub, tv }` en la cookie `koma_session` (7 días); sesión recargada de la BD en cada petición.
  - Límites en memoria (login por IP y correo, solo fallos, se reinicia al acertar; registro 3/h sin contar los 400); `Retry-After` en los 429.
  - `audit.service` con los nombres exactos del plan y filtro de campos secretos; el seed también lo usa.
- **Comprobación:** 26 tests unitarios y 33 de API; prueba manual con `curl` (login, `me`, 401, 403 `CSRF`, logout) y su rastro en `audit_log`.
- **Fallos:** `express-rate-limit` no amplía el tipo `Request` (hace falta `AugmentedRequest`) y solo envía `Retry-After` con sus cabeceras activadas; el log del login correcto salía con `userId` null.
- **Corrección:** a mano, el desarrollador ajustó el plan: el limitador del login cuenta solo los fallos y se reinicia al acertar, el correo de `login_fail` va solo en `after` y el logout sin revocación pasa a "Riesgos aceptados". La IA usó `AugmentedRequest`, puso `Retry-After` en el `error-handler`, dejó el usuario en `res.locals` tras el login y el registro, y extendió el test del filtro de auditoría a sus 7 fragmentos.
- **Aprendizaje:** el límite de registro (3/h por IP) condiciona los tests: cada archivo se planifica con cuántos registros hace.

### 2026-11-01 · Bloque 1 · Tarea 2: páginas /entrar y /registro (CU-07, CU-08, RN-12)
- **Pedido a la IA:** páginas de login y registro, con la cabecera según la sesión; CSS neutro con todo valor visual en `variables.css`.
- **Resultado:**
  - Una plantilla `auth.html` para las dos rutas (`data-mode`) y 303 a `safeNext(next)` con sesión.
  - `bindForm` con errores por campo (`aria-invalid`) y reglas de RN-12 duplicadas en el cliente, con test de paridad.
  - Cabecera y pie desde `layout.ts`, con test de marcadores; `z-index` en `layers.css`.
- **Comprobación:** 32 tests unitarios y 36 de API; el CSS pasado a tokens es idéntico al anterior (comparado con un script, en claro y oscuro).
- **Fallos:** Postgres se paró dos veces durante la sesión (código 255); los primeros tests de las páginas no seguían la convención de nombres (`CU-08` en vez de `Seguridad:`).
- **Corrección:** a mano, el desarrollador revirtió un cambio del `.gitignore`. La cabecera sale de una sola plantilla en lugar de siete copias: lo sugirió el asistente de planificación, el constructor lo propuso con detalle y el desarrollador lo aprobó. La IA renombró los tests y arrancó de nuevo Postgres sin tocar el volumen.
- **Aprendizaje:** un duplicado explícito (cliente ↔ servidor) solo es fiable si un test los compara.

### 2026-11-01 · Bloque 1 · Correcciones de la auditoría de la tarea 1 (RN-13)
- **Pedido a la IA:** corregir el NO APTO del auditor a la tarea 1 antes del despliegue (tarea 3).
- **Fallos:**
  - Bloqueante: la clave del limitador del login era el correo sin validar ni recortar, con cuerpos de hasta 100 kB. Cada correo inventado ocupaba memoria de 15 a 30 minutos.
  - Alto: el límite de registro se saltaba cortando la conexión. `skipFailedRequests` (usada para no contar los 400) también devuelve el intento si el cliente cierra antes de la respuesta, y la cuenta se crea igualmente.
  - Medio: `audit.service` lanzaba un `Error` normal. Bajos: el hash ficticio se calculaba en el primer login; `translateY(-200%)` no usaba un token; "Crea una" y "Entra" no medían 44 px; faltaban casos en el test de paridad; un comentario decía IPv6 /64 (la librería agrupa por /56).
- **Corrección:** `validate` va antes de los dos limitadores; la clave del login usa el correo validado (y recortado a 254); el registro cuenta todo intento válido, sin `skipFailedRequests`; cuerpo de 4 kB en `/api/auth`. `AppError` 500 con mensaje genérico y el detalle en `cause`, solo para el log. RN-13 y la tabla de errores, actualizadas.
- **Comprobación:** 32 tests unitarios y 40 de API. Los tres tests nuevos (correo enorme → 400 sin clave, registros cortados con `AbortController` hasta el 429, 413 en `/api/auth`) se ejecutaron también contra el comportamiento antiguo y fallaban.
- **Aprendizaje:** un limitador en memoria no puede usar como clave nada sin validar, y una opción que "no cuenta los fallos" también descuenta lo que corta el cliente. Un test de seguridad se prueba primero contra el código vulnerable.

### 2026-11-01 · Bloque 1 · Tarea 3 (parte 1): endpoint temporal de IP y guía del primer despliegue
- **Pedido a la IA:** `logger.error` en el hash ficticio y riesgos aceptados de RN-13; de la tarea 3, solo `GET /api/debug/ip` y la documentación del despliegue en Render + Neon.
- **Resultado:**
  - `GET /api/debug/ip` (temporal, sin sesión, `no-store`): `ip`, `xForwardedFor`, `remoteAddress` y `trustProxy`, con test bajo `TRUST_PROXY=1`.
  - "Primer despliegue" en el plan (variables, seed online, verificación de `trust proxy` con prueba de suplantación) y "Publicar online" en el README.
  - `sslmode=verify-full` en vez de `require` (plan, CLAUDE.md, `.env.example`, README): `pg` 8.23 avisa de que `require` cambiará en la v9. `html.ts`, `origin.ts`, `page.ts`, `password.ts`, `paths.ts` y `trailing-slash.ts` ya constaban en el árbol de `ideas_base.md`.
- **Fallos:** un `logger.error` en `utils/password.ts` habría roto `npm test`: el logger carga `env.ts`, que termina el proceso sin variables, y los tests unitarios importan ese archivo.
- **Corrección:** el hash ficticio pasa a `auth.service.ts`; `password.ts` vuelve a ser pura y ni el seed ni los tests calculan un hash que no usan.
- **Pendiente:** desplegar, fijar `TRUST_PROXY` con el procedimiento y borrar el endpoint.
- **Aprendizaje:** antes de añadir un import a una utilidad pura, mirar quién la importa y en qué entorno corre.

### 2026-11-01 · Bloque 1 · Auditoría de las correcciones de la tarea 1 y de la tarea 3 (parte 1)
- **Pedido a la IA:** pasar el `auditor` sobre `88b7a8d..HEAD` y corregir en los docs sus hallazgos 1 y 2.
- **Resultado:** apto con observaciones; las siete correcciones del NO APTO anterior, resueltas y con tests (32 unitarios y 42 de API).
- **Fallos:**
  - La guía de despliegue mandaba poner en Render solo las variables de la columna "Online". `env.ts` exige también las que no cambian (`AD_MIN_SECONDS`, `LOG_LEVEL`…): siguiéndola, la app no arrancaba.
  - "Riesgos aceptados" se quedaba corto: cada entrada del limitador ocupa de 0,4 a 0,5 kB, no 300 bytes, y en el login un 5xx también gasta intento.
  - Historia: un commit sin prefijo y otro que no compilaba (archivos de dos commits mezclados).
- **Corrección:** en Render, todas las de `.env.example` salvo `PORT` y `SEED_*`. Las opcionales sin usar (`STRIPE_TEST_CLOCK_ID`; con `local`, las `R2_*`) se omiten; se comprobó cargando `env.ts` con ellas ausentes y vacías. La guía lista todo lo que se borra con el endpoint, que se queda hasta fijar `TRUST_PROXY`.
- **Aprendizaje:** una guía de variables se contrasta con el esquema de `env.ts`, no con la tabla de las que cambian; cada commit, con solo lo suyo y compilando.

### 2026-11-01 · Bloque 1 · Tarea 3 (parte 2): `TRUST_PROXY` verificado y retirada de /api/debug/ip
- **Pedido a la IA:** anotar el valor verificado en Render y retirar el endpoint temporal con todo lo que lo acompaña.
- **Resultado:** `TRUST_PROXY=3` en RN-13, en el bloque de variables y la guía de "Primer despliegue" del plan, en `.env.example` y en la columna Online del README. Retirados el endpoint, su test, su fila y su nota del contrato y su mención en RN-13; el procedimiento se queda en la guía, marcado como hecho.
- **Comprobación (desarrollador, con `curl` en Render):** `X-Forwarded-For` llega con tres entradas (cliente, Cloudflare y proxy interno). Con `TRUST_PROXY=3`, `ip` es la del cliente y una `X-Forwarded-For` falsa se ignora.
- **Fallos:**
  - Fuera de la sesión de la IA, corregidos por el desarrollador: Render autodetectó el `Dockerfile` y puso Docker como runtime (se cambió a Node); el health check se guardó como `/api/health.`, con punto final, y daba 404; Neon entrega por defecto la cadena agrupada (`-pooler`) con `sslmode=require` (se pasó a la directa con `verify-full`).
  - También fuera de la sesión: el seed online falló porque `APP_URL` estaba vacía en `.env.online` (`env.ts` trata vacío como ausente), y los primeros logins online, anteriores al seed, fallaron y gastaron el límite de intentos.
  - Borrar un test de `server/src` no borra su `.js` de `server/dist` (`tsc` no limpia las salidas huérfanas), y `test:api` ejecuta todo lo que hay en `dist`.
- **Corrección:** se borraron a mano `server/dist/tests/api/debug-ip.test.js` y su `.d.ts`.
- **Aprendizaje:** una guía de despliegue se prueba siguiéndola tal cual, y una variable vacía cuenta como ausente; al borrar un archivo `.ts`, borrar también su salida en `dist`.
