# Diario del portátil Windows

Diario sencillo del trabajo hecho en el portátil Windows, para el agente del equipo de casa (3vil4n0n) cuando haya que unir las dos líneas de trabajo. La bitácora oficial sigue siendo `docs/bitacora.md`; esto solo cuenta qué pasó aquí y qué hay que tener en cuenta al juntar.

## Cómo unir (para el agente de casa)

- **Rama de este equipo:** `windows/d2-estudio-dialogo`, creada desde `develop` en `5c473c8` («Comunidad y Tutoriales en la navegación…», 17-nov 01:18).
- **Lo que casa tiene y aquí no** (nunca llegó a GitHub): la actividad simulada (idea 24, `server/src/scripts/demo-activity.ts` y lo que la acompañe), la rama `feat/premium-diseno` (encargo E1 de Codex, worktree `koma-premium`) y un `client/src/components/confirm-dialog.ts` sin commitear.
- **Choque esperado:** D2 se ha rehecho aquí desde cero, así que el `confirm-dialog.ts` de casa y el de esta rama van a chocar. Quedarse con uno solo; si el de casa estaba a medias, manda el de esta rama.
- **La idea 24 no debería chocar:** son archivos nuevos y `package.json`. Revisar solo `package.json`, `CLAUDE.md` (árbol y tabla de comandos) y `docs/bitacora.md` (entradas de las dos ramas: ordenarlas por fecha).
- **No copiar de aquí:** `.env` ni `docs/credenciales.local.md`. Se generaron nuevos en este portátil con otros secretos y otras contraseñas demo; las de casa siguen valiendo allí.

## Entorno de este portátil

- Windows 11, Node 24.18, npm 12.1, PostgreSQL 18 **nativo** (servicio `postgresql-x64-18`) en el 5432, con el rol `koma`/`koma` y las bases `koma` y `koma_test`. No se usa el `db` de Docker: chocaría con el puerto. Para la demo con `docker compose up`, parar antes ese servicio.
- `npm ci` avisa de que bloquea el script de instalación de `bcrypt`, pero funciona con su binario precompilado `win32-x64`.
- `npm run test:api`: falla siempre 1 test, «Seguridad: ningún enlace simbólico de content/ se sigue…» (`api/import-content.test.ts`), con `EPERM: symlink`. Windows no deja crear enlaces simbólicos sin ser administrador o sin el Modo de desarrollador (Configuración → Sistema → Para programadores). No es un fallo del código: en casa y en la CI (Linux) pasa. El test no se toca.
- Faltan `content/`, `storage/`, `.claude/maqueta/` y `.claude/parches/` (ignorados por git): hay que traerlos de casa en un `.zip`.

## Entradas

### 2026-11-17 · Puesta en marcha

- La copia del proyecto traída en el disco externo llegó con **todos los archivos a 0 bytes** (también `.git` y `node_modules`). No se recuperó nada de ella: se clonó `develop` desde GitHub.
- Comprobado en Windows: `npm ci`, `npm run build` (sin errores), `npm test` (225/225 en verde), `npm run migrate` (10/10), `npm run seed`, `npm run demo:data` y `npm run test:api` (348/349: el que falla es el de los enlaces simbólicos, ver «Entorno»).
- `.env` y `docs/credenciales.local.md` generados nuevos (ignorados por git).
- Siguiente tarea acordada: **D2** del pulido (estudio del autor con el `<dialog>` de confirmación y el aviso flotante, antes de E3), en la rama `windows/d2-estudio-dialogo`.

### 2026-11-17 · D2 hecho (estudio del autor con diálogo y aviso flotante)

- **Qué es:** el estudio del autor ya no usa `confirm()` ni un mensaje por sección. Confirma en un `<dialog>` y avisa en un solo aviso flotante, como `/admin`. Detalle completo en `docs/bitacora.md`, entrada del 17-nov «Estudio del autor con el diálogo de confirmación y el aviso flotante (D2)».
- **Archivos nuevos:** `client/src/components/confirm-dialog.ts`, `client/public/styles/components/confirm-dialog.css`, `client/public/styles/components/floating-notice.css` y los tests `server/src/tests/unit/client-confirm-dialog.test.ts` y `server/src/tests/api/author-dialog-page.test.ts`.
- **Archivos tocados:** `client/src/pages/author.ts`, `client/public/pages/author.html`, `variables.css`, `layers.css`, `author-page.css`, `chapter-editor.css`, `CLAUDE.md` (árbol) y `docs/bitacora.md`.
- **Al unir con casa:** si allí hay un `confirm-dialog.ts` a medias, gana este, que tiene tests. Si casa tocó `author.ts` o `author.html` después del 17-nov a la 01:18, revisar a mano los choques en los `say(...)`, ahora `notify(...)`, y en las regiones de estado que se quitaron.
- **Estado:** typecheck, unitarios 231/231 y API 350/351 (el de enlaces simbólicos, el de Windows). Falta probarlo en el navegador, y el diseño final.

### 2026-11-17 · Revisión del bloque 6 y correcciones

- **Qué es:** `frontend` y `auditor` revisaron el bloque 6 entero (nunca lo habían revisado), sin nada bloqueante. Se corrigieron el lote A (servidor y tests) y el lote B (cliente de `/comunidad`). El lote C (reorganizar CSS y tokens) queda para E4. Detalle en `docs/bitacora.md`, entrada «Revisión del bloque con `frontend` y `auditor`, y sus correcciones».
- **Archivos nuevos:** `server/src/tests/api/illustrations-rate-limit.test.ts`, `server/src/tests/api/community-dialog-page.test.ts` y `server/src/tests/unit/client-community-review.test.ts`.
- **Archivos tocados:**
  - servidor: `illustrations.service.ts`, `illustrations.controller.ts` y `utils/layout.ts` (texto «Comparte tus ilustraciones»);
  - cliente: `pages/community.ts`, `utils/illustrations.ts` y `community.html`;
  - estilos: `community-page.css`, `quick-links.css` y `variables.css`;
  - otros: `.gitignore` (`/videos/`), `docs/plan_mvp.md` (la excepción a RN-13) y `docs/bitacora.md`.
- **Al unir con casa:** si casa tocó `community.ts`, `community.html` o `community-page.css` después del 17-nov a la 01:18, el choque más probable es el diálogo de retirar. Aquí ya usa el componente común de D2 (`#confirm-dialog`), y `#withdraw-dialog` y `.community-dialog*` desaparecen.
- **Estado:** typecheck, unitarios 237/237 y API 353/354 (el de enlaces simbólicos, el de Windows). Falta probarlo en el navegador y desplegarlo.

### 2026-11-17 · Pruebas en el navegador y revisión de /autor

- **Probado aquí en el navegador (por el desarrollador):** `/comunidad`, `/tutoriales` y «Ilustraciones» de `/admin`, todo correcto. Falta el diseño.
- **Sin probar en el navegador:** `/autor`. Se prueba en casa con la lista de la bitácora (entrada «Pruebas en el navegador, revisión de `/autor` y sus correcciones»).
- **Corregido tras la revisión de `/autor`:** navegación interna sin volver a pintar, foco con Atrás y Adelante y tras guardar, retirada de capítulo de una en una, detalle de los errores de subida, `aria-label`, `<noscript>` muerto y paridad de límites. Archivo nuevo: `client/src/utils/author.ts`.
- **Cuentas de prueba solo de este portátil:** `prueba1@demo.test` y `prueba2@demo.test`, creadas por la API en la BD local de Windows. En casa no existen; no hace falta crearlas.
- **Windows:** `npm run dev` (`node --watch`) se reinicia solo y corta peticiones. Para probar a mano, mejor `node --env-file=.env server/dist/server.js`, y reiniciarlo tras compilar.
- **Al unir con casa:** `author.ts` ha cambiado bastante (D2 y esta revisión). Si casa tocó `author.ts` o `author.html` después del 17-nov a la 01:18, revisar los choques a mano.
- **Estado:** bloque 6 cerrado en código. Typecheck, unitarios 243/243 y API 355/356 (el de los enlaces simbólicos). Falta probar `/autor`, desplegar online y lanzar `/cerrar-bloque`.

### 2026-11-17 · La demo en contenedores en este portátil (docs/comandos.md, apartado 10)

- **Resultado:** `docker compose up` funciona en este portátil. `/api/health` da `{"status":"ok","db":"ok"}` por `http://localhost`, por `http://anonymous.local` (el nombre del equipo) y por `http://192.168.1.14`. Entrar con sesión da 200 desde esos tres orígenes y 403 desde uno ajeno (CSRF). Log sin errores.
- **El choque con el PostgreSQL nativo, sin tocar el servicio ni el repositorio:** en `$HOME\koma-lan.yml` (el archivo de los orígenes del paso 10.6), el servicio `db` se publica en el 5433 con `ports: !override ["127.0.0.1:5433:5432"]` (Compose v5). La app usa `db:5432` por la red de Docker y no lo nota. El nativo sigue en el 5432 para el desarrollo diario.
- **Cargar la BD de Docker desde el host:** la variable de entorno `DATABASE_URL` manda sobre `--env-file`. En PowerShell se pone a `postgres://koma:koma@localhost:5433/koma` y se ejecutan `npm run seed` y `npm run demo:data`. Después se borra la variable, para que el desarrollo vuelva al nativo.
- **Fallo encontrado en el paso 10.3:** `.env.example` trae `DISCORD_INVITE_URL=           # opcional…`. Node lo lee como vacío, pero Docker Compose no, y `env.ts` rechaza el valor: la app en contenedor no arranca. Aquí se resolvió con `DISCORD_INVITE_URL: ""` en `koma-lan.yml`. Arreglo propuesto: el comentario en su propia línea (en `.env.example` y en el archivo de entorno de cada equipo).
- **Usar siempre los dos archivos:** con `docker compose` a secas, sin `koma-lan.yml`, el `db` se recrea con el 5432 y no arranca. Para no olvidarlo: `COMPOSE_FILE` con `docker-compose.yml;$HOME\koma-lan.yml` en la terminal de la demo.
- **Datos de la BD de Docker:** las cuentas demo (seed) y `demo:data` (4 obras, 16 capítulos, lecturas y comentarios), más `prueba1@` y `prueba2@demo.test` con 8 ilustraciones pendientes. Sin `content/` en este portátil: falta traerla de casa y ejecutar `npm run content:import` con el mismo `DATABASE_URL`.
- **Pendiente (desarrollador, PowerShell como administrador):** la wifi está en «Pública». Hay que hacer el paso 10.7 (red privada y reglas del cortafuegos para el 80 y el 5353) y después entrar desde el móvil.

### 2026-11-17 · Demo con red propia y koma.local

- **Decisión del desarrollador:** la demo va en una red creada por el portátil (zona con cobertura inalámbrica móvil de Windows), y los móviles entran por `http://koma.local`. Sustituye a depender de la wifi del sitio.
- **Zona wifi:** `Koma-demo`, con contraseña `koma-demo-2026`. Se enciende desde PowerShell con la API de Windows (`NetworkOperatorTetheringManager`), sin administrador. El portátil queda en `192.168.137.1`. Comparte la conexión que haya; sin ninguna, Windows no la deja encender.
- **koma.local:** Windows solo anuncia su propio nombre (`anonymous.local`), así que `$HOME\koma-mdns.mjs`, un respondedor mDNS en Node sin dependencias y fuera del repositorio, contesta `koma.local` con la IP del portátil en la red de quien pregunta: `192.168.137.1` en la zona wifi. Comprobado: pregunta mDNS directa → `192.168.137.1`, y `curl http://koma.local/api/health` → 200.
- **Orígenes (`koma-lan.yml`):** `APP_URL http://koma.local` y `ALLOWED_ORIGINS` con `koma.local`, `192.168.137.1`, `192.168.1.14` y `localhost`.
- **Cortafuegos:** ya había reglas de entrada para Node.js y para el backend de Docker en el perfil Público. La red de la zona wifi no tiene perfil propio. En principio no hace falta ningún paso de administrador; lo confirma la prueba con el móvil.
- **Un solo script para el día de la demo:** `$HOME\koma-demo.ps1` enciende la zona wifi, levanta la app con `COMPOSE_FILE` (los dos archivos) y anuncia `koma.local`. Con `-Parar`, lo apaga.
- **Pendiente (desarrollador):** conectar un móvil a `Koma-demo` y abrir `http://koma.local` (si no resuelve, `http://192.168.137.1`). Probarlo también sin internet (el portátil conectado a una wifi sin salida, o con los datos del móvil apagados). Y llevar a la documentación (`docs/comandos.md`, apartado 10) lo que sirva, cuando el desarrollador lo apruebe.
- **Resultado (más tarde, el mismo día):** con la zona wifi, el móvil no llegó a la app ni por `koma.local` ni por la IP. Se descarta para la demo; ver la entrada siguiente.

### 2026-11-17 · DEMO EN WINDOWS PROBADA Y FUNCIONANDO: misma red, `http://koma.local`

**Probado en este portátil Windows y funciona.** Un móvil Android en la misma wifi que el portátil abre `http://koma.local` y carga Koma. Es el mismo resultado que en el equipo Linux de casa, y es el montaje para el día de la presentación.

- **Montaje que funciona:**
  - Portátil y móviles en la **misma wifi**: la del sitio, sin zona wifi del portátil.
  - La app corre con **Node directamente en Windows**, en el **puerto 80**, con el **PostgreSQL nativo**. Las variables de la línea de comandos mandan sobre el archivo de entorno (contingencia del plan, nivel 3): `HOST=0.0.0.0`, `PORT=80`, `APP_URL=http://koma.local` y `ALLOWED_ORIGINS` con `http://koma.local`, la IP del portátil, `http://127.0.0.1` y `http://localhost`.
  - `koma.local` lo anuncia **`npm run demo:mdns`**, un respondedor mDNS en Node sin dependencias. Estaba primero en `$HOME\koma-mdns.mjs`; ahora está en el repositorio, en `server/src/scripts/demo-mdns.ts`, con sus tests en `unit/demo-mdns.test.ts`.
  - El cortafuegos ya permite la entrada a Node en el perfil Público. **No hace falta administrador.**
- **Lo que no funcionó en Windows, y por qué se descarta:**
  - **La app en Docker** (`docker compose up`, paso 10.8): desde el portátil respondía, pero ningún móvil llegó al puerto 80, ni con reglas del cortafuegos por puerto. Es el reenvío de puertos de Docker Desktop y WSL hacia la red.
  - **La zona wifi del portátil:** el móvil se conectaba, pero no llegaba a la app. Además, Windows la apaga sola si se queda sin dispositivos (ahorro de energía).
- **La clave de `koma.local` en Android:** Android no pregunta como un servicio mDNS completo, sino como «resolvedor simple», desde un puerto cualquiera. La respuesta tiene que repetir la pregunta y llevar su mismo identificador (RFC 6762, §6.7). La primera versión del respondedor no lo hacía, y el móvil repetía la pregunta sin cargar nada. Avahi, en Linux, ya lo hace bien. Corregido el 17-nov.
- **Prueba (17-nov, wifi de casa, portátil en `192.168.1.128`):** el Android (`192.168.1.69`) preguntó por `koma.local` como resolvedor simple, recibió `192.168.1.128` y cargó Koma 10 veces. Los dos intentos de entrar dieron 401 (contraseña incorrecta), no un error de red ni de CSRF.
- **Para el día de la demo:**
  1. El portátil y los móviles, en la misma wifi.
  2. En PowerShell, desde la raíz del repositorio: `powershell -ExecutionPolicy Bypass -File "$HOME\koma-demo.ps1"`. Compila, calcula la IP de la wifi, arranca el respondedor y la app, e imprime `http://koma.local` y la IP como plan B. Ctrl+C lo para todo.
  3. Antes, comprobar que el servicio `postgresql-x64-18` está en marcha (arranca solo con Windows) y que la BD tiene las cuentas y los datos.
- **Riesgos que quedan:**
  - una wifi que aísla a los dispositivos (la de invitados de un centro) o que filtra el multicast;
  - un móvil que no resuelve `.local`. Para los dos, el plan B es la IP.
- **Comandos de Windows (subir, preparar, arrancar, comprobar, bajar y la red del instituto):** en `docs/comandos.md`, apartado 10.12, que es la guía oficial. Arriba del apartado 10 hay un aviso: en Windows, el 10.12.
- **Fuera de git, solo en este portátil:** `$HOME\koma-demo.ps1`, que hace lo mismo que el 10.12 en un solo comando y ya usa el respondedor del repositorio, y `$HOME\koma-lan.yml`, del camino con Docker, que ya no se usa. `$HOME\koma-mdns.mjs` sobra y se puede borrar.
