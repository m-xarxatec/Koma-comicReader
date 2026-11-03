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
