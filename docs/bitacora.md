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

### 2026-11-01 · Bloque 1 · Tarea 4: prueba mínima del webhook de Stripe
- **Pedido a la IA:** `POST /api/stripe/webhook` con `express.raw()`, exento de CSRF, que verifique la firma, registre el evento y responda 200, sin BD (decisiones 1–5 del plan, aprobadas).
- **Resultado:** módulo `payments` (routes, controller, service) e `integrations/payments/stripe.ts` con `Stripe.webhooks.constructEvent` estático (el cliente llega en el bloque 4). Solo con `PAYMENTS_DRIVER=stripe`, después de `request-id` y antes de `csrf`, `auth` y los `express.json`. Contrato, errores, riesgos y paso 7 de "Primer despliegue" en el plan.
- **Comprobación:** 32 tests unitarios y 45 de API. Los de orden y de log fallan al montarlo tras `express.json` o al meter la cabecera en el `warn`. Con `curl`: sin firma, 400 y `warn`; firmado, 200, con las dos líneas bajo el mismo `requestId`.
- **Fallos:** ninguno en el código; al revisar el SDK, su error de firma guarda la cabecera y el cuerpo en `header` y `payload`.
- **Corrección:** el `warn` lleva solo `err.message`, y el error de Stripe nunca va como `cause`.
- **Verificación online (2-nov):** el desarrollador creó en el sandbox el producto, el precio mensual en EUR, el portal (cancelación al fin de periodo y cambio de método de pago) y el destino con los seis eventos y la versión `2026-10-28.endive`; `STRIPE_WEBHOOK_SECRET`, en Render y `.env.online`. `stripe trigger customer.subscription.created` entregó `customer.subscription.created` e `invoice.paid` con 200, y el log muestra "Webhook de Stripe verificado" y la línea `request` con el mismo `requestId`. Sin firma, la IA obtuvo con `curl` 400 `VALIDATION_ERROR` con `X-Request-Id`.
- **Aprendizaje:** antes de registrar un error de una librería, mirar qué guarda dentro, no solo su mensaje.

### 2026-11-02 · Bloque 1 · Cierre del bloque
- **Pedido a la IA:** pasar el `auditor` sobre lo no auditado, corregir sus hallazgos, comprobar la definición de terminado y pasar "Bloque actual" al 2.
- **Resultado:** APTO sobre `d38d978..6f1de55`: la próxima auditoría empieza en `6f1de55`, el commit del paso 7. Tres hallazgos bajos (el `throw err` del webhook no era `AppError`, `'100kb'` repetido y la coletilla del commit del paso 7) y una nota (el README no decía de dónde salen las `STRIPE_*`).
- **Comprobación (IA):** typecheck, 32 tests unitarios y 47 de API. En la BD local, las cinco acciones del bloque con `request_id` y sin secretos; las 29 variables de `env.ts`, en `.env.example`.
- **Comprobación (desarrollador):** `stripe trigger` con 200 en Render; 360 px y teclado; consola y logs sin errores; `docker compose up` con health, login y logout; en Neon, las cinco acciones con la IP del cliente.
- **Fallos:** la auditoría anterior anotó `88b7a8d..HEAD` sin su commit final; se dedujo (`d38d978`) por el commit sin prefijo que citaba. Al revisar el 500, un cuerpo bien firmado que no es JSON llevaba al log un trozo del cuerpo en el mensaje del `SyntaxError` de `JSON.parse`.
- **Corrección:** `AppError` 500 genérico con el original en `cause`, solo para el log, salvo el `SyntaxError`, que se cambia por "El cuerpo firmado no es JSON válido"; `JSON_BODY_LIMIT`, una sola constante en `config/env.ts`; las `STRIPE_*`, en el README. El desarrollador corrigió con `--amend` el mensaje del commit del paso 7.
- **Aprendizaje:** una auditoría anota su rango con los dos commits, nunca con `HEAD`. El test del `SyntaxError` falla con el código anterior; el del evento "thin" no, porque ese cambio es de convención: un test que pasa con los dos fija el contrato, pero no demuestra la corrección.

### 2026-11-02 · Bloque 2 · Base visual de la maqueta (tokens, cabecera, pie, errores y auth)
- **Pedido a la IA:** tareas 1–7 de la base aprobada: paleta y escalas de koma_home con nuestros nombres de token, capas, base, cabecera, navegación móvil y pie en `layout.ts`, las 5 páginas de error y el aspecto de auth.
- **Resultado:** tema oscuro por defecto y claro por preferencia (AA medido; selección en blanco en el claro); `button.css` y `mobile-nav.css` nuevos; marcador `<!-- @head -->` con dos `theme-color` (excepción vigilada por un test); `aria-current` desde el servidor; logo e ilustraciones a WebP con ffmpeg (1 MB → 140 kB); "Repite la contraseña" solo en el cliente; textos de auth sin promesas de fase 2.
- **Comprobación (IA):** typecheck, 36 tests unitarios y 48 de API; el del cuerpo del registro falla si `register` reenvía `input` tal cual. Capturas a 360 y 1440 px (claro, Brave sin interfaz) y a 1920 px (oscuro), sin errores en consola ni de CSP.
- **Fallos:** un parámetro `path` tapaba `node:path` en `error-handler.ts` (visto antes de compilar); el test de páginas contaba un solo `data-login-link`; el 403 aprobado ("Entrar con otra cuenta") no servía con sesión, porque `/entrar` redirige.
- **Corrección:** `requestPath`; el test cuenta Entrar y Registrarse; el 403 lleva "Explorar el catálogo" (aprobado); `register` envía solo los tres campos del contrato.
- **Aprendizaje:** las medidas `width`/`height` de una maqueta se comprueban contra la imagen real: copiadas tal cual deforman o hacen saltar la página.

### 2026-11-02 · Bloque 2 · Agente frontend y correcciones de sus revisiones
- **Pedido a la IA:** crear `.claude/agents/frontend.md` (solo lectura, mismo formato que el auditor), añadirlo a CLAUDE.md, pasarlo sobre la base y aplicar los hallazgos aprobados.
- **Resultado:** primera revisión APTO con observaciones (12 hallazgos, uno alto). Corregidos: buscador con 44 px útiles, sin `@import` (`layers.css` enlazado en cada plantilla), `--line-height-none`, escalón más cercano en la cabecera, "Saltar al contenido" sin negrita, "Navegación principal", icono de acción solo en los errores, clases BEM y degradado del marco en el tema claro.
- **Segunda y tercera revisión (solo lo corregido):** APTO. Después, el token `--scene-glow-error-stop` (sin `max()`), el orden de las hojas también en la página genérica, el foco en el orden del formulario con errores del cliente o del servidor y clases BEM en `<code>` y `<em>`: APTO, sin regresiones.
- **Decisiones del desarrollador:** sin `lazy` en la ilustración de error (primera pantalla); foco de 3 px en todo el sitio; en el 500 y el 503, el catálogo se enlaza desde el menú.
- **Comprobación:** typecheck, 37 tests unitarios (nuevo: `layers.css` en orden y ningún `@import`) y 48 de API; lo visual, el desarrollador en el navegador.
- **Fallos:** la primera prueba corrió como agente general (un tipo nuevo no se carga hasta la sesión siguiente) y con navegador sin interfaz, que el desarrollador descartó: el agente compara solo en código. Al invocarlo faltó una decisión aprobada (la línea de XarxaTec) y la marcó como desvío.
- **Aprendizaje:** al invocar un revisor, pasarle todas las decisiones aprobadas: lo que no consta por escrito lo marca como desvío sin justificar.

### 2026-11-02 · Bloque 2 · Guía "Cargar obras (content/)" con una obra real
- **Pedido a la IA:** guía sencilla en el README con una obra del desarrollador como ejemplo y su `content/` preparado; antes, que el test de la página genérica compruebe que `layers.css` no se repite.
- **Resultado:** sección nueva en el README (carpetas, `comic.json`, `tags.json`, imágenes con ffmpeg, carga local y online, errores frecuentes) con *El amante de las princesas*: autor «KOMA Original», etiquetas humor, harem, romance y aventura (humor y harem, nuevas en `tags.json`), sin aviso, cap. 1 «El amante». `content/` (ignorado por git) preparado con los comandos de la guía: 4 páginas y portada en WebP, 1,25 MB frente a 15 MB.
- **Diferencias con el plan:** carpeta con mayúsculas y guiones bajos, sin carpeta de capítulo, nombres `pagina-01.png` y portada sin llamarse `cover`; sin archivo de datos.
- **Fallos:** el filtro `scale=…:-2` de la guía estiraba 1 px las páginas de alto impar (2369 → 2370).
- **Corrección:** `:-1` conserva el alto exacto; comprobado con ffprobe. La ruta del ejemplo usa `$HOME`, para no dejar el usuario del equipo en el README.
- **Comprobación:** 48 tests de API; JSON validados (formato de las etiquetas, que existan en `tags.json`, `isAdult: false`). Originales sin tocar; nada cargado en la BD.
- **Pendiente:** con un solo capítulo, la demo no enseña el anuncio, la invitación a registrarse ni el saldo (hacen falta 4).

### 2026-11-02 · Bloque 2 · Contrato de la API (borrador)
- **Pedido a la IA:** redactar en el plan el contrato de la API del bloque 2 antes de escribir código.
- **Resultado:** etiquetas, catálogo (título o autor, etiquetas en Y, páginas de 24), ficha con el acceso de cada capítulo, token de anuncio, lectura por `POST` (registra la lectura y pasa el control CSRF) y `/files/:key`, con sus DTO y errores.
- **Pendiente:** aprobación del desarrollador y sus decisiones abiertas (método de la lectura, búsqueda por autor, caducidad del token, claves derivadas de `COOKIE_SECRET`).

### 2026-11-02 · Bloque 2 · Contrato de la API aprobado
- **Pedido a la IA:** incorporar al contrato las decisiones del desarrollador sobre el borrador.
- **Resultado:** aprobado. Lectura por `POST`; búsqueda por título y autor; token de anuncio de 30 min en la cabecera `X-Ad-Token` (`api.ts` aceptará cabeceras opcionales sin cambiar el resto de llamadas); claves de firma derivadas de `COOKIE_SECRET` por etiqueta; páginas de 24 obras; `access` y `read` por capítulo en la ficha; sin orden por tendencias; `width` y `height` en las viñetas, leídos del archivo al importar.
- **Corrección:** el género `humor` se cambia por el de la base `comedia` (en `content/` y en la guía), para no duplicar géneros en el catálogo.
- **Pendiente (desarrollador):** añadir `width` y `height` a `panels` en `modelo_datos.md` y en la tabla del modelo de datos del plan.

### 2026-11-02 · Bloque 2 · Desglose y decisiones aprobados
- **Pedido a la IA:** desglose del bloque (T1–T18, 36 h del 4 al 9-nov, intersticial al final) y decisiones abiertas con recomendación.
- **Lectura:** fila de `reading_credits` en la primera lectura (NULL = lleno con el máximo vigente); premium y admin en `chapter_reads`, sin saldo; admin y autor dueño fuera de las estadísticas; cookie `koma_guest_reads` (HMAC `guest-reads`, 30 días); HKDF por etiqueta; reimportar solo añade capítulos; `/ad` con `ad: null` sin anuncios (contrato actualizado); título y advertencia inyectados y escapados en la página del lector.
- **Home:** `/explorar` → `/#catalogo`; «Tendencias» con las 5 primeras de la petición del catálogo; filtros con casillas desde `/api/tags`; géneros sin «ICONO» ni +18; hero sin texto; Crear en el bloque 3 y Premium en el 4; paginación y estado vacío propios.
- **Ficha:** sin subtítulo ni «En publicación»; todos los capítulos enlazados con su estado; «Autor original»; «Cómo funciona» con las reglas reales.
- **Lector:** barra propia sin cabecera ni pie del sitio (excepción en el test); `#v-N`; «Saltar al contenido»; «Recargar» repite el POST; comentarios en el bloque 3; pantalla completa funcional (API Fullscreen, `aria-pressed`, `fullscreenchange`, `disabled` sin soporte, con test); pantallas sin diseño con piezas aprobadas.
- **Desarrollador:** prepara la segunda obra de demostración y el bucket y el token de R2; la IA no ejecuta nada online.
- **Pendiente (desarrollador):** cambiar en `modelo_datos.md` la línea de creación de la fila de `reading_credits` (D1).

### 2026-11-02 · Bloque 2 · T1: migraciones 004, 005, 007 y 008
- **Pedido a la IA:** las cuatro migraciones del bloque, copiadas de `modelo_datos.md`, con tests de sus restricciones.
- **Resultado:** SQL idéntico al documento (`diff` contra sus bloques). La 006 llega en el bloque 3: `migrate.ts` aplica las pendientes aunque haya huecos.
- **Tests:** `schema.test.ts`, en transacciones que se deshacen: +18 aprobada (RN-17), número único entre capítulos vivos (RN-09), medidas positivas y posición única (RN-18) y claves `UUID.ext`.
- **Comprobación (IA):** `migrate` dos veces en local (4 aplicadas y 0); 52 tests de API.

### 2026-11-02 · Bloque 2 · T2: seed de etiquetas y anuncios
- **Pedido a la IA:** seed del bloque 2: 12 etiquetas base y 3 anuncios de solo texto, idempotente y auditado con `system.seed`.
- **Resultado:** etiquetas con `ON CONFLICT (slug) DO NOTHING`; anuncios en una sola sentencia que solo inserta si `ads` está vacía; cada fila creada, auditada con su id y su slug o marca.
- **Comprobación (IA):** en local, 12 + 3 la primera vez y 0 la segunda; `seed.test.ts` (contenido, auditoría y repetición sin cambios); 54 tests de API.
- **Pendiente:** los nombres visibles no están en `docs/`: se usan los de la maqueta («Terror» para `horror`, «Slice of Life»), a confirmar.

### 2026-11-02 · Bloque 2 · T3: firma y medidas de imagen
- **Pedido a la IA:** tipo por firma y ancho y alto de JPEG, PNG y WebP sin dependencias (RN-10, RN-18).
- **Resultado:** `utils/image.ts`: PNG (IHDR), JPEG (segmentos hasta el SOF, con rellenos; DHT, JPG y DAC no son SOF; SOS o EOI antes, no válido) y WebP VP8, VP8L y VP8X; además, la regex de claves, los Content-Type y `newImageKey`.
- **Comprobación (IA):** 7 tests unitarios con cabeceras hechas byte a byte. Contra `ffprobe`, iguales en 21 archivos reales (`content/`, maqueta e iconos) y en 3 generados (JPEG y WebP sin pérdida y con alfa).
- **Fallos:** ffmpeg no genera JPEG progresivos: el SOF2 solo lo cubre el test unitario.

### 2026-11-02 · Bloque 2 · T4: firmas y drivers de almacenamiento
- **Pedido a la IA:** firmas HMAC con claves derivadas por uso y drivers local y R2 con URLs firmadas.
- **Resultado:** `utils/signing.ts` (HKDF-SHA256; etiquetas `ad-token`, `files` y `guest-reads`; compara el texto de la firma con `timingSafeEqual`; firma con caducidad). `integrations/storage/` (`driver`, `local`, `r2`, `index`): `put` desde disco y `signedUrl`; el local no sobrescribe; R2 según las trampas conocidas.
- **Comprobación (IA):** 8 tests unitarios: clave distinta por uso, firma alterada o con basura, caducidad, claves no válidas rechazadas antes del disco o la red, y URL prefirmada de R2 calculada sin red.
- **Fallos:** la regla `storage/` del `.gitignore` también ignoraba `server/src/integrations/storage/`: git no lo veía y Render no compilaría.
- **Corrección:** pendiente del desarrollador: anclar la regla a la raíz (`/storage/`).
- **Aprendizaje:** tras crear una carpeta, mirar `git status`: una regla sin `/` inicial ignora ese nombre a cualquier profundidad.

### 2026-11-02 · Bloque 2 · T5: GET /files/:key
- **Pedido a la IA:** `GET /files/:key?exp=&sig=` del driver local (contrato del bloque 2).
- **Resultado:** solo con `STORAGE_DRIVER=local`, antes de `auth`. La clave se valida con la regex antes que la firma y que el disco (404); firma o caducidad, 403; `exp` solo en forma canónica; `sendFile` con `root` y `Cache-Control: private` hasta `exp`. Sin zod a propósito: el contrato fija 404 y 403, no 400. La CSP toma los hosts de R2 de `r2.ts`.
- **Comprobación (IA):** `files.test.ts` (6) y `files-r2.test.ts` (2, con credenciales ficticias): con r2 la ruta no existe y la CSP admite justo el origen de las URLs prefirmadas. 62 tests de API, 52 unitarios y typecheck.
- **Comprobación manual (IA):** `curl` al servidor de desarrollo: 200 `image/webp` con `max-age=7200`, 403 y 404. Los logs guardan la ruta sin `sig`.

### 2026-11-02 · Bloque 2 · T6: importación de content/
- **Pedido a la IA:** `npm run content:import` (RN-18), con las reglas de RN-10 y RN-17 y la decisión D5 (una obra existente solo recibe capítulos nuevos).
- **Resultado:** `scripts/import-content.ts` valida cada obra entera antes de subir nada: `comic.json` y `tags.json` con zod estricto, `licenseUrl` solo http(s), nombres solo con dígitos, firma, 5 MB, 60 imágenes y una sola portada. Después sube las imágenes y hace una transacción por obra con `content.import`. Repositorios de obras y capítulos, `config/limits.ts` y la guía del README al día.
- **Comprobación (IA):** 8 tests de API con `content/` y almacenamiento temporales: alta completa, repetición, 15 errores de estructura, límites en el borde, +18, enlaces, obra de autor o retirada y `tags.json`. Dos mutaciones hacen fallar sus tests. En local, *El amante de las princesas*: 4 viñetas con medidas y portada; la segunda carga no cambia nada.
- **Fallos:** `seed.test.ts` contaba todas las etiquetas y fallaría en paralelo con la importación; un test no creaba la carpeta vacía (`path.dirname` de `002/`).
- **Corrección:** el test del seed solo mira las 12 base; `mkdir` directo para las carpetas vacías.
- **Pendiente de confirmar:** un capítulo "ya existente" es cualquier fila con ese número, también retirada o rechazada; la carpeta de una obra de autor o retirada se omite con error; una entrada de `comic.json` sin carpeta solo avisa; con errores, el comando sale con código 1.
- **Aprendizaje:** `node --test` ejecuta los archivos en paralelo sobre la misma `koma_test`: cada test acota sus datos con un sufijo propio y no cuenta filas de toda la tabla.

### 2026-11-02 · Bloque 2 · T7: catálogo y etiquetas
- **Pedido a la IA:** `GET /api/tags` y `GET /api/comics` del contrato (CU-01).
- **Resultado:** módulo `comics` (schema, repository, service, controller y routes). Búsqueda en título y autor con `ILIKE` escapado (`%`, `_` y `\`), etiquetas en Y sin repetidos y páginas de 24 con `total`, de la más reciente a la más antigua; solo aprobadas y no retiradas; portada firmada o `null`. SQL fijo: los filtros vacíos se resuelven con parámetros, sin concatenar datos.
- **Comprobación (IA):** 5 tests unitarios (escape y query) y 8 de API con marcadores propios; con el escape anulado, el de comodines falla. `curl` en local con la obra real: búsqueda, etiquetas en Y, portada 200 y 400 con `fields`. 57 unitarios, 78 de API y typecheck.
- **Fallos:** el recuento y la página iban en `Promise.all` sobre el mismo `Queryable`: con un `PoolClient` serían dos consultas a la vez en un cliente.
- **Corrección:** una tras otra.
- **Commits:** T6 y T7 comparten `comics.repository.ts`. La versión de T6 va en un parche para el índice (`git apply --cached`), comprobado compilando T6 aislado.

### 2026-11-03 · Bloque 2 · Auditoría de T4–T7 y correcciones
- **Pedido a la IA:** pasar el auditor limitado a T4–T7 (firmas, `/files/:key`, importación y catálogo) y aplicar las decisiones del desarrollador.
- **Auditoría:** APTO CON OBSERVACIONES. Dos altos: `/files/%E0%A4%A` y `?q=%00` daban 500. Tres bajos: huérfanas si falla la transacción, `\u0000` y PNG > INTEGER detectados ya en la transacción, etiquetas sin auditar. Además, enlaces simbólicos sin regla.
- **Decisiones del desarrollador:** aprobados los cuatro criterios de T6 (capítulo existente en cualquier estado, obra de autor o retirada omitida con error, capítulo de `comic.json` sin carpeta solo avisa, código de salida 1). Huérfanas por fallo de la transacción: riesgo aceptado (lo anota el desarrollador). Lo demás se corrige.
- **Corrección:** `URIError` → 404; `\u0000` → 400 en la búsqueda y obra omitida en `comic.json`; medidas > INTEGER rechazadas antes de subir; etiquetas creadas o cambiadas en su propia entrada `content.import` (entidad `tags`, solo los campos cambiados); ningún enlace simbólico en `content/` (`lstat`); el error de `JSON.parse` sin trozos del archivo.
- **Tests nuevos:** `exp` negativo y de 16 cifras, página `MAX_SAFE_INTEGER` y `../` sin normalizar con `node:http`: con `fetch`, la petición nunca llegaba a la ruta.
- **Comprobación (IA):** los dos 500 reproducidos antes y 404, 404 y 400 después; typecheck, 58 unitarios y 84 de API.
- **Commits:** uno por hallazgo, con parches para el índice (`git apply --cached`), porque varios tocan `import-content.ts`.
- **Aprendizaje:** `JSON.parse` cita el texto cercano al error: el mensaje de una librería que lee archivos ajenos no se reenvía tal cual.

### 2026-11-03 · Bloque 2 · T8: reglas puras de la lectura
- **Pedido a la IA:** las reglas puras de RN-01 y RN-02 con sus tests (desglose aprobado).
- **Resultado:** `modules/reading/reading.rules.ts`. RN-02: saldo recalculado al consultar y consumo; sin fila o con periodo NULL, lleno con el máximo vigente; un reloj atrasado no resta. RN-01: token `payload.firma`, con la hora en ms, forma canónica y 30 min como máximo. Constantes en `limits.ts`.
- **Desvío del desglose:** `chapterAccess` va en `permissions.ts`, no en `reading.rules.ts`, porque CLAUDE.md lo fija como único archivo de permisos.
- **Tests:** 14 unitarios: 8 de RN-02 (lleno, primer consumo, recarga por periodos, tope, sin saldo con `retryAt`, parámetros cambiados, reloj atrasado y máximo 1), 3 del token y 3 de `access` por rol y número.
- **Comprobación (IA):** typecheck, 72 unitarios y 84 de API.
- **Pendiente:** RN-03 (`reads_since_ad` e intersticial) sigue en T11b y T17, como en el desglose.

### 2026-11-03 · Bloque 2 · T9: ficha de la obra
- **Pedido a la IA:** `GET /api/comics/:slug` del contrato (CU-02, RN-06, RN-07).
- **Resultado:** `requirePublicComic` en `comics.service.ts`, compartida con el anuncio y la lectura: 404 si la obra no existe o no está aprobada, 410 si se retiró. Un slug que no cumple la regex da 404 sin consultar la BD (con `%00` habría sido un 500). `ComicDto` con los capítulos públicos por número, `access` (de `chapterAccess`) y `read` (de `chapter_reads`).
- **Tests:** `comic.test.ts` (7) y `reading-fixtures.ts`, que crea usuarios con su sesión firmada (sin login, fuera de RN-13) y obras con capítulos en cada estado.
- **Comprobación (IA):** 102 de API; `curl` con la obra real en local.

### 2026-11-03 · Bloque 2 · T10: anuncio del invitado
- **Pedido a la IA:** `GET /api/comics/:slug/ad` (RN-01).
- **Resultado:** módulo `reading` (repository, service, controller y routes). Anuncio activo al azar o `null`, token firmado con la clave `ad-token` y `minSeconds`; `Cache-Control: no-store`; no guarda nada.
- **Tests:** `ad.test.ts` (3): forma, token válido solo para esa obra y pasados los segundos mínimos, token nuevo en cada petición, 404 y 410. Sin test de `ad: null`: desactivar los anuncios afectaría a los tests que corren en paralelo.

### 2026-11-03 · Bloque 2 · T11a: lectura, parte 1
- **Pedido a la IA:** `POST /api/comics/:slug/chapters/:number/read`: 404 y 410, admin y premium, caps. 1–2, invitado, viñetas firmadas y anterior y siguiente.
- **Resultado:** orden del contrato con `chapterAccess`: token en `X-Ad-Token` (403 `AD_NOT_COMPLETED`), 401 desde el cap. 4. Número de capítulo canónico. Un capítulo retirado y publicado da 410; uno sustituido sirve el nuevo; anterior y siguiente saltan los no públicos. `no-store`. Sin efectos en la BD todavía.
- **Pendiente (T11b):** el registrado sin premium en un capítulo de pago recibe un 500 provisional, para que nadie lea sin gastar saldo; también faltan `ads.end`, `balance` y las escrituras.
- **Tests:** `read.test.ts` (8), con el CSRF incluido. **Comprobación (IA):** typecheck, 72 unitarios y 102 de API; `curl` en local: viñeta 200, sin `Origin` 403 y 0 errores en el log.

### 2026-11-03 · Bloque 2 · T11b: lectura, parte 2 (saldo, anuncio final y estadísticas)
- **Pedido a la IA:** quitar el 500 provisional de T11a con RN-02, RN-03 y los efectos de la lectura. Además, validar slug y número con zod respondiendo 404 y un test del anuncio sin anuncios activos.
- **Resultado:** el registrado sin premium lee en una transacción. La fila de saldo se crea si falta (D1) y se bloquea con `FOR UPDATE`; el saldo se recalcula y gasta 1 en la primera lectura de pago; sin saldo, 403 `READING_LIMIT` con `retryAt` y sin efectos. También en la transacción: `chapter_reads`, `reads_since_ad` y `user_reads` (sin el admin ni el autor dueño). Premium y admin, sin saldo ni anuncios. El invitado tiene la cookie `koma_guest_reads` (HMAC `guest-reads`, últimos 50, 30 días) y `guest_reads`. `ads.end` al azar para el registrado sin premium, también para un autor en su propia obra.
- **Zod en los parámetros:** `validate` admite `notFound: ['params']`, que da 404 con el mensaje del schema (`comicParams`, `chapterParams`). Es el paso `schema` del recorrido de CLAUDE.md.
- **Anuncio sin anuncios activos:** `buildAdStart` es una función pura que usa el servicio; el test unitario la prueba con `null`, porque `npm test` no carga `.env` y el servicio sí.
- **Tests:** 9 de API en `read-credits.test.ts` y 5 unitarios. La prueba HTTP de lecturas simultáneas pasaba también sin `FOR UPDATE`; la del bloqueo con `lock_timeout` sí falla sin él (comprobado).
- **Comprobación (IA):** typecheck, 77 unitarios y 112 de API. En local, `reader` con anuncio y saldo 5/5; cookie del invitado con sus atributos; 0 errores en el log.
- **Aprendizaje:** un `INSERT … ON CONFLICT` sobre una fila recién insertada por otra transacción ya espera: para probar un `FOR UPDATE`, la fila tiene que existir antes.

### 2026-11-03 · Bloque 2 · T12: rutas HTML del catálogo y del lector, y cabeceras en api.ts
- **Decisión previa (desarrollador):** la autora lee su propia obra sin anuncios (ni final ni intersticial) ni saldo. Esas lecturas no crean la fila de saldo ni cuentan para `reads_since_ad`. Commit aparte, con su test.
- **Pedido a la IA:** `/obra/:slug`, `/leer/:slug` (301) y `/leer/:slug/:numero`, `page.ts` y cabeceras opcionales en `api.ts`.
- **Resultado:** páginas con las comprobaciones del mapa de rutas: 404 y 410 en HTML; parámetros con zod y `notFound`, también en las URLs en español (`:numero`). El título, el capítulo y la advertencia (RN-08) se inyectan escapados. `comic.html` y `reader.html` son plantillas mínimas que T14 y T15 sustituyen con la maqueta. `api.ts` acepta `{ headers }` por petición, sin dejar que tapen `Accept` ni el `Content-Type` del JSON.
- **Tests:** `reading-pages.test.ts` (6, con un título hostil), `client-api.test.ts` (2) y `layout.test.ts` con los valores nuevos.
- **Comprobación (IA):** typecheck, 79 unitarios y 118 de API; `curl` en local: ficha, 301 al cap. 1, lector, 404 y 0 errores en el log.

### 2026-11-04 · Bloque 2 · T13: home (catálogo, Tendencias y géneros) y solo tema oscuro
- **Pedido a la IA:** integrar la home de koma_home conectada a `/api/tags` y `/api/comics` (CU-01). Codex la escribió en tres vueltas en un worktree aparte (`t13-codex`), con encargo y revisión del agente `frontend` en cada vuelta. La IA de este repositorio cerró la tarea: aplicó la decisión del tema oscuro y las 11 observaciones de la vuelta 3.
- **Resultado:** hero, accesos rápidos, Tendencias (las 5 primeras de la petición del catálogo), «Explorar por género» y un catálogo con filtro por título o autor y por géneros, paginación de 24, estado vacío, página fuera de rango y «Reintentar». Tarjetas en vertical con la proporción de la portada real (`--home-cover-ratio`, 1055/1491, `contain`) y los cinco degradados de la maqueta. `utils/catalog.ts` repite los límites del contrato, y `client-parity.test.ts` comprueba que coinciden con zod.
- **Decisión del desarrollador: solo tema oscuro.** Fuera las variantes `prefers-color-scheme: light` (base, home y portadas) y el apoyo del logotipo, que solo servía al tema claro. Queda `color-scheme: dark`, con un solo `<meta name="theme-color">` en `layout.ts`. Un test nuevo exige un único `--color-bg` igual al `theme-color` y que ninguna hoja use `prefers-color-scheme`. El agente `frontend` ya no comprueba el tema claro.
- **Vuelta 3 del agente (decisiones del desarrollador):** icono de género como la maqueta (`.7rem`, borde discontinuo, color plano); «Tutoriales · Próximamente» se queda; «Explorar por género» y el filtro empiezan con `hidden` hasta que haya géneros; brillo solo en las portadas sin imagen (`comic-card__cover--empty`); `alt=""` en la portada (el título nombra el enlace); foco con `border-radius: inherit`; carriles en `scroll-lane.css` (relleno para el foco y margen negativo para alinearse con el título); paginación deshabilitada con `pointer-events: none`; `width`/`height` de la portada leídos del token con `getComputedStyle`; filtros con los valores exactos de la maqueta y `align-items: end` desde 40rem (en 64rem siguen las 2 columnas: con casillas, la rejilla de 4 de la maqueta no encaja).
- **Última revisión del agente:** APTO CON OBSERVACIONES, sin regresiones ni restos del tema claro. Corregidos: `scroll-margin-top` en `.content-section` se sumaba al `scroll-padding-top` de `html` (las anclas quedaban 12rem por debajo), un comentario obsoleto de `.page` y `a.quick-link:hover` → `.quick-link:not(.quick-link--soon):hover`.
- **Comprobación (IA):** typecheck, 84 unitarios y 118 de API. Lo visual (360 px, escritorio y teclado), el desarrollador en el navegador.
- **Pendiente (desarrollador):** línea de autor en las tarjetas (no está en la maqueta); «Explorar cómics» y «Leer» → `#catalogo` en lugar de `#tendencias`; `.eyebrow` a `.75rem` (maqueta `.72rem`); `eager` en las portadas de Tendencias a 360 px; tokens sin uso heredados (`--color-surface-soft`, `--color-success`, `--color-info`, `--duration-normal`; `--reader-width` es para T15); `.comic-grid` y `.genre-grid` en el archivo de su tarjeta, como en la maqueta.
- **Limpieza:** borrados el worktree `../koma-t13` y la rama `t13-codex` (sin commits propios). El encargo y los registros siguen en `.git/codex-t13/`.
- **Aprendizaje:** `scroll-padding-top` en `html` y `scroll-margin-top` en el destino se suman: el desplazamiento de las anclas va en un solo sitio.

### 2026-11-04 · Bloque 2 · Decisiones sobre la revisión de T13
- **Decisiones del desarrollador:** la línea de autor de las tarjetas se queda; «Explorar cómics» y «Leer» siguen a `#catalogo`; los tokens sin uso se quedan hasta el cierre del bloque (allí se borran los que sigan sin uso); las rejillas siguen en el archivo de su tarjeta.
- **Resultado:** `.eyebrow` a `.72rem` con `--font-size-eyebrow`, como en la maqueta. En `/entrar` y `/registro` se queda `.75rem` (`auth__eyebrow`, `auth__story-eyebrow`), porque allí la maqueta usa `account-*__eyebrow` con `--text-xs`. En Tendencias, solo las 2 primeras portadas van sin `lazy` (`TRENDING_EAGER_COVERS`).
- **Commit:** `variables.css`, `base.css`, `auth.css` y `comic-card.ts` también llevan cambios de T14: su parte va en un parche para el índice (`git apply --cached`). Sus pruebas unitarias pasan aisladas, en una copia de `HEAD`.

### 2026-11-04 · Bloque 2 · Segunda obra de demostración (D26)
- **Pedido a la IA:** preparar en `content/` *El señor de los anillos de cebolla* para probar el lector (anuncio en el cap. 3, invitación en el 4, saldo y desplazamiento) e importarla en local.
- **Resultado:** `el-senor-de-los-anillos-de-cebolla`, «KOMA Original», «Obra propia» sin enlace, `aventura` y `fantasia`, sin aviso. El cap. 1 lleva la portada y las 5 páginas reales en WebP (con los comandos de la guía del README). Los caps. 2–4 son provisionales: 4 páginas de color plano cada uno (azul, verde y marrón), de 1200 px de ancho y altos de 2200–2300 px. `fantasia` se añade a `content/tags.json` con el nombre del seed, así que la importación no cambia la etiqueta.
- **Desvío del pedido:** se pidieron «la portada y las 4 páginas», pero la carpeta trae 5 páginas seguidas. El desarrollador eligió las 5 y la licencia «Obra propia» antes de importar: la importación solo añade capítulos (D5), así que un capítulo equivocado no se arregla volviendo a importar.
- **Comprobación (IA):** en local, 1 obra creada y 4 capítulos (5, 4, 4 y 4 viñetas, con sus medidas), y *El amante de las princesas* sin cambios. La API da para el invitado `free`, `free`, `ad` y `account`.
- **Pendiente (desarrollador):** sustituir los caps. 2–4 por páginas reales. La portada mide 1024 × 1536 (2:3): en las tarjetas de la home (1055/1491) deja unas franjas finas con `contain`.

### 2026-11-04 · Bloque 2 · T14: ficha de la obra
- **Pedido a la IA:** la ficha de koma_home (`obra/obra-demo-01`) conectada a `GET /api/comics/:slug` (CU-02, RN-07), con D16–D19.
- **Resultado:**
  - `comic.html`: el servidor inyecta el título, escapado, en `<title>`, las migas, el `<h1>` y la `description`.
  - `comic.ts` pinta lo demás con `textContent`: portada (2/3, `contain`, sin `lazy`), «N capítulos», etiquetas (a `/?tags=…#catalogo`), sinopsis, créditos («Autor original», «Publicado por» con el autor o «La plataforma» y la licencia con su enlace solo si es http(s)), «Leer capítulo N», la advertencia (RN-08, solo informativa) y los capítulos, todos enlazados con su estado (Leído, Libre, Usa 1 de saldo, Con anuncio, Requiere cuenta).
  - «¿Cómo funciona la lectura?» explica las reglas reales, sin «Descubrir Premium» (bloque 4).
  - Las etiquetas van en un `<dl>`, como pide el plan. El `<dt>` «Etiquetas» es solo para lectores de pantalla.
  - Seis CSS, uno por componente: `content-warning.css` va aparte para reutilizarlo en el lector. Tokens nuevos con los valores exactos de la maqueta. Tres iconos copiados de la maqueta (candado, check, chevron). `utils/ratio.ts` lee el `width`/`height` de una imagen de su token de proporción y lo comparten la tarjeta y la ficha.
- **Revisión del agente `frontend`:** APTO CON OBSERVACIONES (11). Corregidos:
  - `hidden` no ocultaba la advertencia vacía, las etiquetas ni «Leer capítulo 1» de una obra sin capítulos, porque su clase ponía `display`. Ahora hay una regla `[hidden]` común en `base.css`, y sobra la de `catalog-pagination.css`.
  - El enlace de la licencia mide ahora 44 px de alto.
  - Los `h2` de sinopsis, advertencia y lectura usan el interlineado del cuerpo, como en la maqueta.
  - Sin el botón Premium, el último párrafo del panel de lectura cierra sin margen.
  - `icon--small` en vez de repetir medidas.
  - BEM en los antetítulos de auth.
  - `--radius-circle` también en auth y en las páginas de error.
  - Un comentario junto al texto de las reglas, que repite `FREE_CHAPTERS` y `AD_CHAPTER` de `limits.ts`.
  - Sin cambio: las áreas táctiles de las etiquetas se solapan unos 6 px cuando pasan a otra fila.
- **Tests:** el de la ficha comprueba también el título escapado en las migas y en el atributo `description`.
- **Comprobación (IA):** typecheck, 84 unitarios y 118 de API. Con `curl` en local, la página, los CSS, los JS y los datos de la API. La captura sin interfaz no arranca en este entorno: lo visual (360 px, escritorio, teclado y estados por rol) lo revisa el desarrollador.
- **Aprendizaje:** `hidden` solo aplica `display: none` desde la hoja del navegador, y la clase de cualquier componente con `display` lo anula. La regla común evita repetir un `[hidden]` por componente.

### 2026-11-04 · Bloque 2 · Portadas 2:3 y etiquetas sin solaparse
- **Decisiones del desarrollador (al aprobar T14):** la proporción 2:3 es el estándar de las portadas de la plataforma, con `object-fit: cover`, y el solapamiento de las áreas táctiles de las etiquetas (hallazgo 11 de T14) se corrige.
- **Resultado:** un solo token `--cover-ratio: 2 / 3`, en lugar de `--home-cover-ratio` (1055/1491) y `--work-cover-ratio`, en las tarjetas y en la ficha, con `cover`. El `row-gap` de las etiquetas es `--touch-target − --work-tag-height` (12 px): las áreas de 44 px de dos filas ya no se solapan. La guía del README recomienda portadas en 2:3.
- **Commit:** `variables.css` y `comic.ts` también llevan cambios de T15: su parte va en un parche para el índice. Compila y pasa sus 84 tests unitarios aislado, en una copia de `HEAD`.

### 2026-11-04 · Bloque 2 · T15: lector
- **Pedido a la IA:** el lector de koma_home (`leer/obra-demo-01/1`) conectado a la lectura por `POST` y al anuncio (CU-03, CU-04, CU-12, CU-24), con D7 y D20–D25.
- **Resultado:**
  - `reader.html` lleva `@head` y una barra propia: «Volver a la obra», logo y pantalla completa. No lleva la cabecera, el pie ni la navegación móvil del sitio (D20); `layout.test.ts` lo recoge como excepción explícita (`OWN_CHROME`, solo `pages/reader.html`).
  - El servidor inyecta, escapados, el `slug`, la obra, el capítulo y la advertencia.
  - `reader.ts`:
    - Si la obra tiene advertencia y no se aceptó en este dispositivo, la pide antes del `POST` (RN-08, D7; `localStorage` por obra con `try/catch`).
    - Después pide el capítulo y pinta la respuesta: la tira con `figure#v-N` (las 2 primeras viñetas sin `lazy`, `width`/`height` de la API), la nota del saldo (RN-02), el anuncio final (RN-03) y el fin del capítulo con «Capítulo siguiente».
    - Ante los errores de la API: con `AD_NOT_COMPLETED`, el anuncio con su cuenta atrás de `minSeconds` y, después, el `POST` con `X-Ad-Token`; con 401, la invitación (el `next` conserva `#v-n`); con `READING_LIMIT`, el muro, con la hora de la recarga y «Leer ahora» al llegar `retryAt`, sin reintento automático (D25).
    - Con 404, 410 y fallos de red, una pantalla de error con «Reintentar».
  - «Recargar» en una viñeta repite el `POST` y solo cambia los `src`: la posición se conserva (D22).
  - Pantalla completa con la API Fullscreen sobre la tira (D24): `aria-pressed`, la etiqueta (y el `aria-label`) cambia entre entrar y salir, el estado se sincroniza con `fullscreenchange`, y sin soporte el botón queda `disabled` con `title`. El botón de salir va dentro de la tira, y la posición se conserva al entrar y al salir.
  - Sin comentarios, «Ocultar iconos» ni compartir viñeta (D23). El intersticial queda para T17.
  - CSS: `reader-page` (columna y antetítulo compartidos), `reader-topbar`, `reader-intro`, `reader-strip`, `reader-screen` (la tarjeta del fin de capítulo, con la que se componen todas las pantallas) y `ad-card`. Tokens con los valores de la maqueta. Capas `--layer-reader-topbar` y `--layer-reader-exit`. Iconos `arrow-left` y `expand`, copiados de la maqueta.
- **Tests:** `reader.test.ts` (5) carga el JS compilado del cliente:
  - Pantalla completa sin soporte, entrar y salir, el estado tras `fullscreenchange` y un rechazo del navegador.
  - La cuenta atrás de RN-01 y la hora del muro de RN-02.
  - El test de la página comprueba el `h1` (título del capítulo), el antetítulo escapado y «Volver a la obra» sin JS.
- **Revisión del agente `frontend`:** APTO CON OBSERVACIONES (10). Corregidos:
  - El botón de pantalla completa mide 44 px de ancho en móvil.
  - Títulos de las pantallas a `1.5rem`, el `h2` por defecto de la maqueta.
  - Al pasar a otra pantalla con la tira en pantalla completa, primero se sale (si no, la pantalla quedaba negra y sin botón de salir).
  - Columna y antetítulo sin duplicar.
  - La ficha baja a `#capitulos` al pintarlos.
  - `cursor: not-allowed` sin soporte de pantalla completa.
  - `--reader-tools-gap` fuera.
  - La imagen del anuncio del cap. 3 va sin `lazy`.
  - `viewport-fit=cover`, para que valga `env(safe-area-inset-*)`.
  - Además, dos puntos de su lista para el navegador: el logo ya no salta mientras el botón está oculto (rejilla de 3 columnas), y el foco pasa al título de la pantalla nueva o al `h1` cuando desaparece el botón pulsado.
- **Desvíos justificados:** sin el `figcaption` de cada viñeta, porque repetía el `alt` y se leía dos veces. La imagen del anuncio no reserva su hueco: el contrato no da sus medidas.
- **Comprobación (IA):** typecheck, 89 unitarios y 118 de API. Con `curl` en local, con la segunda obra como invitado: cap. 1 con 5 viñetas; cap. 3, 403 `AD_NOT_COMPLETED` sin token o con uno de menos de 5 s, y 200 pasados 5 s; cap. 4, 401. Lo visual y la API Fullscreen los revisa el desarrollador en el navegador: la captura sin interfaz no arranca en este entorno.
- **Pendiente (desarrollador):**
  - En el navegador: 360 px y escritorio, con teclado.
  - Advertencia: probarla con una obra que la tenga.
  - Saldo y muro: con `reader@`, bajando `reading.max_balance` con SQL (D26).
  - Pantalla completa: con el botón, con Esc y con el gesto del sistema.
  - «Recargar»: con la red cortada.
- **Aprendizaje:** con la API Fullscreen sobre un elemento, solo se ve ese elemento: los controles para salir tienen que ir dentro de él, y cualquier cambio de pantalla que lo oculte tiene que salir antes.

### 2026-11-04 · Bloque 2 · Segunda revisión del lector
- **Pedido del desarrollador:** explicar el cambio de `reading.service.ts` en T15, pasar otra vez el agente `frontend` solo sobre el lector y confirmar el `alt` de las viñetas.
- **`reading.service.ts`:** solo añade `slug` a `ReaderPageValues`, los valores que `sendPage` inyecta en la página `/leer/:slug/:numero` («Volver a la obra» y «Ver todos los capítulos» funcionan sin JS). Ningún endpoint de `/api/*` lo devuelve, así que la API no cambia. Lo cubre el test de la página (`href="/obra/<slug>"`).
- **`alt` de las viñetas:** «Viñeta N del capítulo M»; nunca está vacío. El desarrollador aprueba quitar el `figcaption`.
- **Agente `frontend`:** APTO, con las 10 correcciones de la primera pasada comprobadas y 4 hallazgos bajos. Corregidos:
  - Al salir de pantalla completa porque otra pantalla oculta la tira, ya no se desplaza la página ni se mueve el foco (regresión de la corrección 3).
  - `reader-screen__block` como mezcla BEM en lugar de `.reader-screen .content-warning` y `.reader-screen .ad-card`.
  - Un comentario duplicado en `layout.test.ts`.
- **Pendiente (desarrollador):** los botones deshabilitados del lector usan la base del sitio (opacidad 0,6 y `cursor: progress`), y la maqueta usa .56 y `not-allowed`.
- **Comprobación (IA):** typecheck, 89 unitarios y 118 de API.

### 2026-11-04 · Bloque 2 · T16: versión online con R2
- **Pedido a la IA:** la lista de variables de Render y los comandos de seed y de importación online. El desarrollador los ejecuta; la IA no ejecuta nada contra Neon ni R2.
- **Resultado (IA):** no hay variables nuevas desde el cierre del bloque 1 (`env.ts` y `.env.example` comparados con `6f1de55`). En Render solo cambia `STORAGE_DRIVER` a `r2`, y se añaden `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET`. Lo mismo en `.env.online`, más `PORT`, `HOST` y `SEED_*`.
- **Ejecución (desarrollador):**
  - `seed:online`: Neon por la conexión directa (sin `-pooler`) y `r2`. Crea 12 etiquetas y 3 anuncios; 0 usuarios y 0 ajustes, que ya existían.
  - `content:import:online`: crea la etiqueta `harem` de `content/tags.json` e importa las dos obras (1 + 4 capítulos), con 0 errores.
- **Fallos:** al principio, las imágenes online daban 404 en `/files/…`. Las variables de R2 se habían cambiado solo en `.env.online`, y Render seguía con `STORAGE_DRIVER=local`: firmaba URLs de su disco efímero, donde no hay imágenes.
- **Corrección:** `STORAGE_DRIVER=r2` y las cuatro `R2_*` también en Render; tras el reinicio, todo carga desde R2. El README lo avisa en "Publicar online" y en los errores frecuentes.
- **Comprobación (desarrollador, online):**
  - El catálogo muestra las dos obras con portada, sin errores de CSP.
  - Como invitado: el anuncio en el cap. 3 y la invitación en el 4.
  - Registrado: el saldo y el anuncio final.
- **Aprendizaje:** `.env.online` no configura la web: solo lo leen los scripts que se ejecutan desde local. Cualquier variable de la app online se cambia en Render.

### 2026-11-04 · Bloque 2 · Botones deshabilitados del lector y T17: intersticial
- **Decisiones del desarrollador:** los botones deshabilitados del lector, con los valores de la maqueta (pendiente de la segunda revisión del lector). El intersticial, como pantalla previa a la tira y sin espera: la maqueta no lo diseña y `docs/` no dice dónde va.
- **Botones:** tokens `--cursor-disabled` (base, `progress`: en los formularios es una carga en curso), `--opacity-reader-disabled` (0,56) y `--cursor-reader-disabled` (`not-allowed`). `reader-page.css` los aplica con `:root:has(.reader-page)`, así que también llegan al botón de pantalla completa de la barra, fuera de `main`. El resto del sitio sigue con 0,6 y `progress`. La regla propia del botón de pantalla completa sobra y se quita.
- **Resultado T17 (RN-03):**
  - Servidor:
    - `INTERSTITIAL_EVERY = 5` en `limits.ts`.
    - La regla pura `countReadForAd` suma una primera lectura y, al llegar a 5, devuelve el intersticial y el contador a 0. Un contador guardado por encima de 5 (de antes de T17, cuando solo se sumaba) también lo da y vuelve a 0.
    - El servicio la aplica sobre la fila ya bloqueada por `lockCredits`, en la misma transacción, y devuelve `ads.interstitial` al azar entre los activos (puede coincidir con `ads.end`).
    - Premium, admin, el autor en su obra y las relecturas no cuentan, como antes.
  - Cliente: `showInterstitial` muestra una pantalla con el anuncio, «Continuar al capítulo N» y «Volver a la obra»; «Continuar» pinta el capítulo que ya llegó. «Recargar» es una relectura y nunca lo trae.
- **Tests:**
  - 2 unitarios: intersticial en la 5.ª y la 10.ª primera lectura, y contador por encima del límite.
  - 2 de API: la 5.ª primera lectura lo trae y deja `reads_since_ad` en 0, y ni las relecturas ni «Recargar» cuentan; un 403 `READING_LIMIT` no cuenta y un contador en 7 lo da y vuelve a 0.
- **Revisión del agente `frontend`:** APTO. Comprobó el foco, el anuncio de estado, el `#v-n` tras «Continuar», el escapado, la CSP y que los botones del resto del sitio no cambian. Su único hallazgo era esta entrada.
- **Comprobación (IA):** typecheck, 91 unitarios y 120 de API.
- **Pendiente (desarrollador):**
  - En el navegador, a 360 px y en escritorio, con teclado:
    - El intersticial de `reader@` tras 5 primeras lecturas.
    - Con advertencia y con `#v-3`.
    - «Continuar en N s» del cap. 3 con opacidad 0,56.
    - Los formularios siguen igual.
  - Online, tras el push.
- **Aprendizaje:** un contador que una tarea anterior solo sumaba puede llegar por encima del límite. La regla debe aceptarlo (`>=`) en lugar de esperar que coincida justo con 5.

### 2026-11-04 · Bloque 2 · T18: cierre del bloque
- **Pedido del desarrollador:**
  - Auditor sobre T1–T17, con las decisiones aprobadas.
  - Repaso de la definición de terminado.
  - Borrar los tokens sin uso.
  - Propuestas para CLAUDE.md (155 líneas, a ≤ 150) y para el árbol de `ideas_base.md`, que edita él.
- **Agente `auditor`:** APTO CON OBSERVACIONES. Revisó 63 commits (`6f1de55..6d85cf0`) y comprobó:
  - Las migraciones son idénticas a `modelo_datos.md`.
  - Nada de las fases 2 y 3 y ninguna dependencia nueva.
  - SQL parametrizado, `textContent` y CSP directiva a directiva.
  - CSRF en el `POST` de lectura.
  - La clave de `/files` se valida antes de la firma y del disco.
  - RN-01 a RN-03 en el orden del contrato.
  - Tests con su prefijo RN o «Seguridad:».

  Hallazgos:
  1. Media: `reading.service.ts:70` y `:167` lanzan `Error` en lugar de `AppError(500, 'INTERNAL_ERROR', …, { cause })`.
  2. Baja: los tokens sin uso.
  3. Baja: `MAX_INT` está repetido en `reading.schema.ts` y en `import-content.ts`.

  El 1 y el 3 quedan para la decisión del desarrollador; el 2 lo resuelve este cierre.
- **Tokens:** se borran `--color-info` y `--duration-normal`, los dos únicos sin uso de 326. `--color-success` y `--color-surface-soft` ya se usan.
- **Auditoría en la BD local:**
  - `system.seed` en etiquetas (12), anuncios (3), ajustes y usuarios, y `content.import` en las dos obras.
  - La etiqueta `harem` local no tiene entrada: se creó el 2-nov, antes de `a66918a`, que empezó a auditar las etiquetas importadas. En Neon, importada con el código actual, sí debería tenerla.
- **Definición de terminado:**
  - Cumplido: typecheck, tests (91 unitarios y 120 de API), diff revisado (auditor), auditoría en la misma transacción, sin variables nuevas (comparado con `6f1de55`) y bitácora.
  - Online: comprobado hasta T16 por el desarrollador; T17 está desplegado, pero sin probar.
  - Manual y pendiente (desarrollador):
    - Navegador a 360 px y en escritorio, con teclado, en la home, la ficha y el lector (T13–T17).
    - Consola y logs sin errores.
    - `audit_log` de Neon.
- **Pendientes que no bloquean:**
  - Confirmar los nombres visibles de las etiquetas del seed («Terror», «Slice of Life»).
  - Los caps. 2–4 de la segunda obra son provisionales.
  - El build de Docker de la app, que no se ha probado en este bloque.
- **Estado:** el bloque 2 queda cerrado por la IA. Se da por cerrado del todo cuando el desarrollador termine las comprobaciones manuales y decida sobre los hallazgos 1 y 3.

### 2026-11-04 · Bloque 3 · Contrato de la API (borrador)
- **Pedido a la IA:** redactar en el plan el contrato de la API del bloque 3 antes de escribir código, con el formato del bloque 2, más el desglose en tareas y las decisiones abiertas.
- **Resultado:** comentarios por viñeta (lista pública, publicar con límite de 5 / min, borrar el propio) y su contador en el `ReadingDto`; compartir viñeta sin API; perfil (nombre y contraseña con JWT nuevo); obras del autor (alta con slug, licencia de lista cerrada y portada); capítulos en borrador con subida de viñetas de una en una, borrado con recompactación, envío a revisión y retirada; retirar obra (dueño o admin); vista previa del dueño y del admin. Cada endpoint, con su permiso, sus errores y su auditoría.
- **Pendiente (desarrollador):** aprobar el contrato y las decisiones D1–D22; los cambios propuestos a RN-13 y a la línea "Bloque actual" de CLAUDE.md los edita él.

### 2026-11-04 · Bloque 3 · Contrato aprobado y T0: pendientes del bloque 2
- **Decisiones del desarrollador:** contrato aprobado con D1–D8 y D10–D22 como se recomendaron. D9 cambia: reordenar viñetas entra (`PATCH …/panels/:position`, SQL en `modelo_datos.md`). RN-12 manda sobre los textos de la maqueta del perfil; dos casillas separadas (advertencia y +18), sin CC BY-NC; cada imagen se sube al elegirla; fuera "Panel admin ↗"; el control del 12-nov queda como revisión de estado. Commits sin líneas de firma.
- **T0 (hallazgos 1 y 3 del auditor del bloque 2):** `reading.service.ts` lanza `AppError(500, 'INTERNAL_ERROR', …, { cause })` en lugar de `Error`; `PG_MAX_INT` vive en `limits.ts` y lo usan `reading.schema.ts` e `import-content.ts`.
- **Comprobación (IA):** typecheck, 91 unitarios y 120 de API.

### 2026-11-04 · Bloque 3 · T1: migración 006 y piezas comunes
- **Resultado:** `006_comments.sql` copiada de `modelo_datos.md`; `migrate.ts` la aplica aunque 007 y 008 ya estén (el `npm run dev` del desarrollador la aplicó sobre la BD local). Límites de D5 en `limits.ts`. `utils/text.ts`: regla común de textos (recorte, `\r\n` → `\n`, puntos de código, sin caracteres de control salvo `\n` en los de varias líneas) y `textField` de zod. `comics.rules.ts`: `slugify`, `nextFreeSlug` (RN-09) y las cuatro licencias con su URL (D6). `remove(key)` en los dos drivers (idempotente). `permissions.ts`: `PermissionSubject` lleva `id`; `canManageComic`, `canWithdrawComic`, `canPreviewComic`, `canComment` y `canDeleteOwnComment`.
- **Tests:** `comics-rules.test.ts` (RN-09, RN-07), `text.test.ts`, `permissions.test.ts` y `storage.test.ts` ampliados, y el CHECK de `comments.body` en `schema.test.ts`.
- **Pendiente (desarrollador):** añadir `utils/text.ts` a la lista de `utils/` de CLAUDE.md y de `ideas_base.md`.

### 2026-11-04 · Bloque 3 · T2: API de comentarios
- **Resultado:** módulo `comments` (lista pública, publicar y borrar el propio) según el contrato, con el limitador de 5 / min por usuario después de `validate` y `requireAuth`, y `comment.delete_own` en la misma transacción. La lectura añade `comments` a cada viñeta. `validate` comprueba ahora los params antes que el cuerpo: una ruta que no puede existir da 404 aunque el cuerpo tampoco valga.
- **Fallos:** el test de 404 agotaba el límite de 5 / min (los 404 del servicio cuentan, como dice el contrato) y `read.test.ts` comparaba las claves exactas de la viñeta. Se usa un usuario por caso y se añade `comments` a las claves esperadas.
- **Comprobación (IA):** typecheck, 105 unitarios y 131 de API; con `curl` en local, lista vacía (200), publicar sin sesión (401) y contadores a 0 en la lectura.

### 2026-11-04 · Bloque 3 · T3: lector con comentarios, iconos y compartir
- **Resultado:** icono con contador en cada viñeta, `<dialog>` de la maqueta (hoja inferior en móvil, lateral en escritorio) con la lista, "Ver más", publicar con contador de caracteres, borrar el propio y "Entra para comentar" para el invitado (`next` con `#v-n`). Compartir: Web Share → `<input readonly>` seleccionado, con "Copiar enlace" solo si hay portapapeles. "Ocultar iconos de comentarios" en `localStorage` con `try/catch`; los iconos se ocultan también en pantalla completa. `bindForm` admite `<textarea>`, `<select>`, casillas y radios. Iconos `chat` y `link` copiados de la maqueta.
- **Revisión del agente `frontend`:** APTO CON OBSERVACIONES (14). Corregidos: foco al textarea tras publicar; carrera al abrir dos viñetas seguidas; región de estado siempre en el árbol; con páginas sin cargar, el comentario nuevo no se pinta en mitad de la lista y borrar recarga desde la página 1; interruptor como `reader-intro__toggle` y a 1rem del texto; `autocomplete="off"` en el comentario y el enlace; cerrar por el fondo solo si el clic empezó ahí; "1 comentario más"; contador con `aria-live="off"`; radios en `bindForm`.
- **Desvíos justificados:** sin el `maxlength` del textarea (cuenta unidades UTF-16 y el servidor, puntos de código); sin la nota "Demostración local…" de la maqueta; cada comentario muestra su fecha (`<time>`); el campo del enlace usa `form__input` (48 px de alto); textos de compartir y copiar adaptados a los tres casos.
- **Comprobación (IA):** typecheck, 110 unitarios y 131 de API; con `curl`, la página del lector sirve el diálogo y responden `comment-panel.js`, su CSS y el sprite.
- **Pendiente (desarrollador), en el navegador a 360 px y en escritorio, con teclado:** icono y panel frente a la maqueta; foco al abrir, cerrar (Esc, ×, fondo), publicar y borrar; dos viñetas seguidas con la red lenta; NVDA o VoiceOver con "Comentario publicado."; teclado virtual con el enlace desplegado; pantalla completa y preferencia al recargar; invitado → login → vuelta a `#v-n`; compartir en el móvil por `http://koma.local` (solo el `<input>`).

### 2026-11-05 · Bloque 3 · T4: API de perfil
- **Resultado:** `PATCH /api/me` (módulo `users`: routes, schema, controller) con la regla de nombre del registro, que `auth.schema.ts` exporta; sin cambio no escribe ni audita, y con cambio audita `user.update_profile` con el nombre de antes y el de después. `POST /api/auth/password` (D12) en el módulo `auth`: la contraseña actual incorrecta es un 400 en `fields.currentPassword`; los hashes se calculan fuera de la transacción, y dentro van el hash nuevo, `token_version + 1` y `user.password_change` sin `before` ni `after`. Responde con un JWT nuevo en la cookie (RN-15). El `UPDATE` exige el `token_version` de la sesión: si otra petición la invalidó entretanto, 401 y no cambia nada. Limitador de D11 (5 / 15 min por usuario, acertar lo pone a cero) después de `requireAuth` y `validate`.
- **Tests:** `profile.test.ts` (15): nombre recortado, en puntos de código y auditado; mismo nombre sin auditoría; correo no editable; cookie nueva, sesión anterior inválida y login con la nueva; contraseña nueva de 10 caracteres a 72 bytes; el 6.º intento da 429 aunque acierte; acertar pone el contador a cero; un 400 no cuenta; 401 sin sesión y con la cuenta suspendida; CSRF; 4 kB.
- **Comprobación (IA):** typecheck, 110 unitarios y 146 de API; con `curl` en local (cuenta nueva `curl-11641@perfil.test` en la BD de desarrollo): 401 sin sesión, 200 al cambiar el nombre, 400 con la contraseña actual incorrecta, 200 con cookie nueva y `/api/me` con ella. Sin errores ni avisos en el log.

### 2026-11-05 · Bloque 3 · T5: página /perfil y cabecera
- **Resultado:** `/perfil` (`profile.html` + `profile.ts`) según la maqueta: avatar de iniciales decorativas, "Datos personales" (nombre y correo de solo lectura), "Seguridad" (actual, nueva y "Repite la nueva contraseña", que se comprueba solo en el cliente con `confirmationOf('newPassword')`) y la tarjeta Premium solo con el estado (D17). El servidor inyecta los datos escapados (`profilePageValues`), y el plan en `data-plan`; la fecha de fin va en ISO y el cliente la formatea. Sin sesión, `requirePageAuth` (`roles.ts`) responde 302 a `/entrar?next=%2Fperfil`. Al guardar, el nombre se actualiza con `textContent` en la página, en el avatar y en la cabecera; el aviso de éxito va en un `role="status"` siempre presente. Cabecera (D16): el nombre es un enlace a `/perfil`, con `aria-current` en esa página y un área táctil de 44 px. `failureOutcome` pasa de `auth.ts` a `validate.ts` para que lo compartan los dos. Icono `crown` copiado de la maqueta.
- **Revisión del agente `frontend`:** APTO CON OBSERVACIONES (11). Corregidos: los `placeholder` de las contraseñas; el ancho mínimo del enlace del nombre; el token `--font-size-profile-title` con el valor de la maqueta; el `gap` de 1rem de los formularios (`profile-card__form`); el comentario del relleno inferior; sin `maxlength` en el nombre (cuenta unidades UTF-16 y no dejaba escribir 30 emojis válidos; se quita también en `auth.html`); el comentario partido de `header.ts`; y `profile-card__benefit` en lugar de `li + li`.
- **Desvíos justificados:**
  - Textos propios de la maqueta sustituidos: "en tu perfil" → "en tus comentarios" (no hay perfil público en el MVP); "Correo ficticio…" → "El correo no se puede cambiar."; "Diseño del formulario…" → aviso de que se cierran las demás sesiones (RN-15).
  - Sin "Ver Premium" ni la nota "Estado de muestra" (D17; los cambios sí se guardan).
  - Las migas usan el componente común `breadcrumb` (el mismo margen y el mismo subrayado al pasar el ratón que en la ficha), no los valores de `profile-main__breadcrumb`.
  - Un formulario no puede enviar PATCH: sin JS, el POST a `/api/me` da 404. El aviso `noscript` lo explica.
  - `initials()` está duplicada en el servidor y en el cliente sin test de paridad: es decorativa y meterla en `utils/` añadiría un archivo fuera de la estructura.
- **Pendiente:** el enlace "Crear" de D16 (solo autores) llega en T9, con `/autor`; hoy sería un enlace roto. Lo ha señalado el agente, pero viene de antes: si un envío falla sin `fields` (429 o 500), `bindForm` deja el foco en el botón desactivado.
- **Tests:** `pages.test.ts` (302, 200 con un solo h1 y los datos escapados, cuenta premium con su fecha, barra final), `client-parity.test.ts` (contraseñas actual y nueva, nombre del perfil, `confirmationOf`) y `layout.test.ts` (valores de `profile.html`).
- **Comprobación (IA):** typecheck, 113 unitarios y 150 de API; con `curl` en local: 302 sin sesión, 200 con sesión (iniciales, plan y tipo de cuenta) y los JS, CSS y sprite con su tipo. Sin errores en el log.
- **Pendiente (desarrollador), en el navegador a 360 px y en escritorio, con teclado:** la lista del agente: tamaño del h1 y separación entre campos frente a la maqueta; rejilla de 1, 2 y 3 columnas; tarjeta Premium con una cuenta gratuita y con una premium; nombre largo y nombre corto en la cabecera; guardar el nombre (cabecera, iniciales, aviso y foco); contraseña incorrecta, confirmación distinta sin petición, 429 con la hora y la otra sesión cerrada; de `/perfil` sin sesión al login y vuelta; `noscript`; consola sin avisos de CSP.
