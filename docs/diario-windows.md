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
