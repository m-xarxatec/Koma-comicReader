# Plan de limpieza del harness · Koma

- **Fecha:** 2026-11-13. **Base revisada:** commit `d62ba1d` (copia del repositorio en el segundo ordenador).
- **Estado:** versión definitiva, aprobada por el desarrollador el 2026-11-13 para ejecutarse. Lo aplicado está marcado en la sección 10; las condiciones de la ejecución, en la sección 12.
- **Contrastado con:** `CLAUDE.md`, `docs/plan_mvp.md`, `docs/comandos.md`, `package.json`, `.gitignore`, `.dockerignore` y el contenido completo de `.claude/` (sección 12). Decisiones DL1 y DL10–DL13 resueltas; DL2–DL9 siguen abiertas (sección 9).
- **Objetivo:** que el harness de Claude Code (CLAUDE.md, agentes, skills, hooks, permisos) sea más eficiente, deje el código limpio, impida modificar los tests existentes, exija tests nuevos en cada funcionalidad y se pueda enseñar en la entrega del curso.
- **Si eres un agente:** antes de actuar, lee la sección 11 («Instrucciones para el agente») entera. Las tareas están en la sección 10. La sección 12 corrige con datos reales lo que las secciones 1–9 suponían: si chocan, manda la 12.

## Índice

1. Alcance de la auditoría
2. Resumen y estado
3. Lo que ya está bien
4. Hallazgos (H1–H11)
5. Recomendaciones para `.claude/`
6. `.gitignore` y `.dockerignore`
7. Actividad simulada (bots)
8. Plan de mejora por pasos
9. Decisiones del desarrollador (DL1–DL13)
10. Checklist de tareas
11. Instrucciones para el agente
12. Contraste con los archivos reales

---

## 1. Alcance de la auditoría

- **Revisado:** `CLAUDE.md`, los seis documentos de `docs/` (unas 4.100 líneas), los 67 archivos de tests (28 unitarios y 39 de API, más `helpers.ts` y `reading-fixtures.ts`) y los 140 commits del historial.
- **`.claude/`, completa** (listado del 13-nov): `agents/auditor.md`, `agents/frontend.md`, `skills/constructor/SKILL.md`, `encargos/` (`bloque5-propuesta.md`, `codex-admin.md`, `codex-estudio.md` y `codex-premium.md`), `parches/` (`2-dashboard.patch` y `3-demo.patch`), `settings.local.json` y `t13-stripe-online.md`. No hay `settings.json`, hooks ni copia de la maqueta. Los once archivos se han leído (sección 12).
- **También revisados:** `package.json`, `.gitignore`, `.dockerignore` y `docs/comandos.md`.
- **Sin ver:** `docker-compose.yml`, `Dockerfile`, los `tsconfig.json`, `.env.example`, el código y el estado de git (`git ls-files`, `git status`). Es lo que queda para la tarea 0.4.
- **Desfase, explicado en parte:** `CLAUDE.md` nombra `demo-activity.ts`, `demo-activity-guard.ts` y `npm run demo:activity` porque la actividad simulada se documentó el 10-nov (`plan_mvp.md`, «Pulido») antes de construirse: `package.json` no tiene esos scripts y la bitácora recibida no tiene ninguna entrada que la construya. `server/src/db/seeds/` sigue sin explicación. La tarea 0.1 se mantiene.

## 2. Resumen y estado

El método ya está por encima de lo habitual: plan → contrato aprobado → tareas → construcción → revisión por agentes → bitácora. Tiene dos puntos débiles:

- Casi todo depende de **promesas escritas** (reglas de `CLAUDE.md` que la IA debería cumplir) y no de **candados** (bloqueos que la herramienta aplica aunque la IA se equivoque).
- Lo que más cuenta para la entrega, el harness, **no se ve en el repositorio**.

| Área | Estado | En una línea |
| --- | --- | --- |
| `CLAUDE.md` | Bien, con desfases | 149 líneas y ordenado, pero con referencias viejas y con las reglas de cliente y servidor mezcladas |
| `docs/` | Completa, pero pesada | `plan_mvp.md` tiene 1.611 líneas y `bitacora.md` 1.286: cada consulta lee mucho |
| Agentes | Buen diseño, algo desfasados | Dos revisores (`auditor` y `frontend`) sin Edit ni Write, pero con Bash; Codex con encargos de alcance cerrado. `constructor` no es un agente: es una skill |
| Bitácora | Excelente | La mejor prueba del trabajo con IA |
| Tests | Bien en cantidad y criterio | Unos 490 tests (184 unitarios y 310 de API), cada uno con el nombre de su regla (RN-xx / `Seguridad:`), y algunos que vigilan el propio código |
| Protección de tests | Solo de palabra | No hay regla escrita ni bloqueo |
| Tests nuevos por funcionalidad | Costumbre, no regla | Casi siempre se cumple, pero nada lo exige |
| Skills | Una | `constructor` (`/constructor`); el resto de flujos que se repiten viven como texto |
| Hooks y permisos | No hay | No existe `settings.json`. `settings.local.json` solo da acceso a la carpeta de la maqueta: ni los secretos ni los comandos contra producción tienen candado |
| Integración continua (CI) | No hay | Los tests solo corren si alguien se acuerda |
| Visibilidad para la evaluación | Mala | `.claude/` está fuera de git |

## 3. Lo que ya está bien (mantenerlo y enseñarlo)

1. **Desarrollo guiado por especificación.** Nada se programa sin contrato aprobado. `CLAUDE.md` obliga a preguntar si algo no está especificado y a avisar si contradice a `docs/`.
2. **Reparto de papeles entre agentes.** Uno construye y dos revisan sin poder modificar nada. Codex trabaja en un worktree aparte, con encargos que dicen qué carpetas no puede tocar. Quien hace no es quien revisa: es orquestación multiagente de verdad.
3. **Git lo controla el desarrollador.** La IA entrega los comandos y él decide si se ejecutan.
4. **La bitácora.** Tiene una plantilla fija (pedido, resultado, fallos, corrección y aprendizaje) y aprendizajes reales. Un ejemplo: «un test que pasa con el código viejo y con el nuevo fija el contrato, pero no demuestra la corrección».
5. **Tests que vigilan el código, no solo la app:**
   - `no-any.test.ts` prohíbe `any`;
   - `client-parity.test.ts` obliga a que cliente y servidor tengan las mismas constantes;
   - otro test compara `theme-color` con `--color-bg`.

   Son candados hechos con tests.
6. **BD de pruebas aislada** (`koma_test`), que se niega a actuar si el nombre de la base no termina en `_test`.

## 4. Hallazgos

### H1 · El harness no está en el repositorio (prioridad alta)

`.claude` está en el `.gitignore` desde el principio. Eso tiene tres consecuencias:

- Quien evalúe en GitHub no ve agentes, encargos ni configuración.
- Solo existe en un ordenador: si falla el disco, se pierde.
- Desde el segundo ordenador no se trabaja con las mismas reglas.

### H2 · «No tocar los tests» es solo una intención (prioridad alta)

**Dato:** de los 68 commits que tocaron tests, 36 borraron o cambiaron líneas de tests que ya existían. Una muestra revisada eran cambios legítimos, porque había cambiado el contrato: nuevas secciones de `/admin` y un nuevo resultado de la importación. El problema es doble:

- nada distingue un cambio aprobado de aflojar un test para que pase;
- `CLAUDE.md` no dice en ningún sitio que los tests existentes no se tocan.

**Recomendación,** en tres capas:

- **Regla escrita en `CLAUDE.md`:** los tests existentes no se modifican ni se borran. Si un cambio de contrato aprobado obliga a hacerlo, la IA se detiene, explica qué comprobación cambia y por qué, espera el «sí» del desarrollador y lo anota en la bitácora.
- **Candado (hook):** se bloquea cualquier edición de un archivo que ya exista en `server/src/tests/`. Crear archivos nuevos sí está permitido. Una excepción aprobada la desbloquea el desarrollador a mano, nunca la IA.
- **Segunda red (hook *Stop*):** al terminar se mira el resultado, no el comando. Si `git status --porcelain -- server/src/tests/` muestra un archivo existente modificado, borrado o renombrado que no está en `.claude/permiso-tests.txt`, la tarea no se puede cerrar. Cubre lo que el filtro de comandos de shell deje pasar.
- **Revisión:** en cada diff, el `auditor` lista toda comprobación (`assert`) eliminada o cambiada.

### H3 · Secretos y producción sin un candado comprobable (prioridad alta)

- En la carpeta del proyecto viven `.env`, `.env.online` (con las claves de Neon, R2 y Stripe de la versión online) y `docs/credenciales.local.md`.
- `seed:online` y `content:import:online` escriben en la base de datos real.
- `CLAUDE.md` dice «nunca ejecutes git add/commit/push», pero es solo texto.
- `git push origin main` despliega en Render (`docs/comandos.md`): un push no autorizado es un cambio en producción.

**Recomendación** para los permisos del proyecto:

- **Prohibido:** leer esos tres archivos; `git add`, `git commit`, `git push`, `git reset`, `git rm`, `git restore`, `git clean`, `git stash` y `git checkout`. Es la misma lista que la sección 11: todo lo que escribe en git o descarta trabajo.
- **Prohibido también, para no tocar la BD local:** `docker compose down` (con o sin `-v`), `docker volume rm` y `docker compose rm`. Si hace falta recrear el volumen, lo hace el desarrollador en su terminal.
- **Preguntar siempre:** cualquier `npm run …:online`, `psql` y los scripts que escriben en la BD de desarrollo (`npm run migrate`, `seed`, `content:import` y `demo:data`).
- **Permitido sin preguntar:** `npm test`, `npm run build`, `npm run typecheck`, `git status`, `git diff` y `git log`. Menos interrupciones, más eficiencia.

### H4 · «Cada funcionalidad trae sus tests» es costumbre, no regla (prioridad media)

Hay 7 commits `feat`/`fix` sin tests en el mismo commit. La mayoría son de estilos, lo cual es normal, pero dos son de autenticación (`94cd586` y `41db89b`). Puede que sus tests llegaran en otro commit, pero nada lo exige: la definición de terminado solo pide «tests de sus RN» al cerrar el bloque, no por funcionalidad.

**Recomendación: test primero.** Se escribe el test, se ve fallar y después se programa, como ya aprendió la bitácora. Se apoya en el «Modo tarea» de la skill `constructor` (DL10) y en un hook que no deje dar la tarea por terminada con tests en rojo.

### H5 · No hay integración continua (prioridad media)

Con GitHub Actions, cada push compilaría y pasaría los tests unitarios y los de API (con Postgres). GitHub mostraría una marca verde o roja visible para quien evalúa, y se notaría si alguien cambia un test y rompe otro. No es una dependencia de la app, así que no choca con «No haremos», pero sí es una carpeta nueva (`.github/`) y necesita aprobación (DL2).

**Dato técnico:** `npm run test:api` usa `--env-file=.env`, que falla si el archivo no existe. La CI tendría que crear un `.env` propio, con valores de prueba que no sean secretos, sin cambiar los scripts.

### H6 · `CLAUDE.md` con desfases (prioridad media)

- Nombra archivos que aquí no existen: `demo-activity.ts`, `demo-activity-guard.ts`, `npm run demo:activity` y `db/seeds/`.
- Omite archivos que sí existen: `docs/comandos.md`, `client/src/services/admin.ts`, `client/src/services/payments.ts` y `client/src/utils/admin.ts`.
- No dice la fecha de congelación (20-nov), aunque «Guía para CLAUDE.md» de `plan_mvp.md` lo pedía.
- La línea «Bloque actual» se actualiza a mano.

**Recomendación:** un test nuevo que compruebe que cada archivo del árbol de `CLAUDE.md` existe, en la línea de los tests que vigilan el código.

### H7 · `CLAUDE.md` mezcla tres públicos (prioridad media)

Juntas hay reglas comunes, reglas solo del cliente (BEM, 44 px, mobile-first, `variables.css`) y reglas solo del servidor (Stripe, R2, Neon, Render). Todo se carga en cada sesión, aunque solo se toque CSS.

- **Partirlo:** un `CLAUDE.md` raíz con lo común, más `client/CLAUDE.md` y `server/CLAUDE.md`, que Claude carga solo cuando trabaja en esa carpeta.
- **Quitar duplicados:** la «Definición de terminado» está copiada en `CLAUDE.md` y en `plan_mvp.md`, y dos copias acaban diciendo cosas distintas. Mejor una sola fuente.
- **Tratar igual a los agentes:** el agente `frontend` está descrito dentro de `CLAUDE.md`, pero `auditor` y `constructor` no. Mejor una tabla corta de «quién hace qué» (agentes, skills y hooks) y el detalle en el archivo de cada agente.
- **Añadir lo que falta:** una sección «Tests» (H2 y H4) y otra de «Código limpio».

**Cuidados:**

- `plan_mvp.md` fija `CLAUDE.md` en 150 líneas como máximo, y ya tiene 149.
- 9 archivos de `server/src` y `client/src` citan secciones de `CLAUDE.md` por su nombre («Trampas conocidas», «Seguridad obligatoria», «integrations/»…). Si las secciones cambian de archivo o de nombre, esos comentarios quedan desfasados, y cambiarlos es tocar código de la app.
- «Guía para CLAUDE.md» de `plan_mvp.md` fija el orden de las secciones. Reorganizar el archivo la contradice, así que se avisa y se propone actualizarla.

### H8 · Flujos que se repiten y deberían ser skills (prioridad media)

Una skill es una receta que Claude carga solo cuando hace falta, así que ahorra contexto, y que siempre se ejecuta igual.

| Skill | Qué haría |
| --- | --- |
| `constructor` (ya existe; se mejora su «Modo tarea», DL10) | Leer la RN y el contrato → escribir un test que falle → programar → typecheck y tests → `frontend`/`auditor` → bitácora → comandos git |
| `cerrar-bloque` | Recorrer los 9 puntos de la definición de terminado, actualizar «Bloque actual», revisar `CLAUDE.md` y pasar `/simplify` y `/code-review` |
| `bitacora` | Escribir la entrada con la plantilla de `docs/bitacora.md` |
| `encargo-codex` | Preparar el encargo con su alcance cerrado y la lista de lo que queda fuera |
| `entregar-commit` | Dar los comandos `git add`/`git commit` con el formato `tipo(módulo): … (RN-xx)` |
| `actividad-simulada` · `reemplazar-capitulos` (opcionales) | Los pasos de `plan_mvp.md` («Pulido»), con sus comprobaciones previas |

### H9 · Código limpio: hay base y faltan ajustes baratos (prioridad media)

- **Avisos de TypeScript:** activar en `server/tsconfig.json` y `client/tsconfig.json` `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` y `noFallthroughCasesInSwitch`. Encuentran código muerto sin dependencias.
- **Comandos de Claude Code:** pasar `/simplify` y `/code-review` al cerrar cada encargo.
- **Archivos grandes:** `client/src/pages/author.ts` tiene 1.156 líneas, `admin.ts` 657 y `reader.ts` 615. Partirlos es una mejora real, pero no antes de la congelación salvo que haya tests delante.

### H10 · Documentos muy grandes para la IA (prioridad baja)

Cada consulta a `plan_mvp.md` o a `bitacora.md` gasta contexto, y la IA puede acabar leyendo una sección vieja. Tres arreglos:

- un índice al principio de cada uno;
- archivar aparte los contratos de los bloques 1 a 4, ya cerrados;
- que las skills apunten a la sección exacta.

### H11 · Pequeñas incoherencias (prioridad baja)

- `docs/modelo_datos.md` está en el `.gitignore` pero versionado, así que esa línea no hace nada (DL1).
- No se mide la cobertura de tests, y Node ya trae esa medición sin dependencias. Un «X % cubierto» es buena prueba para la presentación.
- El `Dockerfile` hace `COPY . .` y `.dockerignore` no excluye `.claude/`, `CLAUDE.md` ni `docs/`: la imagen se llevaría la configuración local de Claude.

## 5. Recomendaciones para `.claude/`

Estructura propuesta:

```
.claude/
├── settings.json          ← a git · permisos y hooks del proyecto (iguales en los dos ordenadores)
├── settings.local.json    ← FUERA de git · preferencias de cada máquina
├── permiso-tests.txt      ← FUERA de git · desbloqueo puntual de tests (solo lo crea el desarrollador)
├── agents/                ← a git
│   ├── auditor.md         (+ revisión de tests cambiados o borrados)
│   └── frontend.md
├── skills/                ← a git · constructor ya existe; el resto son nuevas (H8)
│   ├── constructor/SKILL.md   (ya existe; «Modo tarea» con test primero, DL10)
│   ├── cerrar-bloque/SKILL.md
│   ├── bitacora/SKILL.md
│   ├── encargo-codex/SKILL.md
│   └── entregar-commit/SKILL.md
├── hooks/                 ← a git · scripts .mjs en Node, sin dependencias, para Windows y Linux
│   ├── proteger-tests.mjs
│   ├── proteger-secretos.mjs
│   ├── verificar-al-terminar.mjs
│   └── inicio-sesion.mjs
├── encargos/              ← a git · los encargos a Codex son la prueba del trabajo multiagente
├── maqueta/               ← FUERA de git (DL11) · copia de la maqueta, para frontend y para Codex
└── parches/               ← FUERA de git (DL13) · restos de trabajo
```

**Hooks recomendados:**

| Momento | Qué hace |
| --- | --- |
| Antes de editar o de ejecutar (*PreToolUse*) | Bloquea la edición de un test existente (con Edit/Write o con comandos de shell que escriban en `server/src/tests/`), salvo los archivos que el desarrollador liste en `.claude/permiso-tests.txt`. Bloquea leer, editar o mostrar secretos |
| Después de editar (*PostToolUse*, opcional) | Compila (`npm run typecheck`) tras editar un `.ts`, para que Claude vea al momento si algo se ha roto |
| Al dar la tarea por terminada (*Stop*) | Primero comprueba que no hay tests existentes modificados o borrados sin permiso (H2). Después, si hay cambios en `server/` o `client/`, pasa `npm test`; con alguno en rojo, Claude no puede cerrar la tarea |
| Al empezar la sesión (*SessionStart*) | Muestra la línea «Bloque actual», `git status --short`, recuerda la regla de los tests y avisa si `permiso-tests.txt` tiene entradas abiertas |

**Qué revisar o sacar** de lo que ya existe (no se ha visto: es una lista de cosas a mirar):

- Credenciales, URLs de bases de datos o claves dentro de agentes, encargos o settings. Revisado: no hay ninguna (0.3).
- Reglas copiadas de `CLAUDE.md` dentro de los agentes. Mejor que digan «aplica `CLAUDE.md` y la sección X de `docs/…`», porque las copias se desactualizan.
- `auditor` y `frontend` ya tienen `tools: Read, Grep, Glob, Bash`: no pueden usar Edit ni Write, pero Bash sí puede escribir (`sed -i`, `>`, `rm`). Bash les hace falta para `npm test` y `rg`, así que no se quita: los hooks de A5 y A6 tienen que cubrir también a los subagentes, y se prueba en A9.
- Restos: `parches/` se queda fuera de git (DL13). Dentro de `.claude/` no hay worktrees ni registros.
- Los encargos nuevos ya viven en `.claude/encargos/` (`plan_mvp.md`, «Pulido»). Solo el de T13 y sus registros están en `.git/codex-t13/`, donde nunca se suben. Si se quieren como evidencia, pasarlos a `.claude/encargos/` (DL3).
- Plugins: el segundo ordenador tiene `superpowers` instalado para el usuario. Si el principal no lo tiene, Claude se comporta distinto en cada uno, así que conviene declarar en `.claude/settings.json` los plugins que espera el proyecto (DL8).

## 6. `.gitignore` y `.dockerignore`

| Línea | Qué hacer | Por qué |
| --- | --- | --- |
| `.claude` | **Cambiar** por `.claude/settings.local.json`, `.claude/permiso-tests.txt`, `.claude/maqueta/` (DL11) y `.claude/parches/` (DL13) | Que el harness se vea en GitHub y esté en los dos ordenadores, sin subir la configuración de cada máquina, la copia de la maqueta ni los restos |
| `.env`, `.env.online`, `docs/credenciales.local.md` | Dejar | Son secretos |
| `docs/modelo_datos.md` | **Quitar la línea** (DL1, decidido). Comprobar además que `docs/ideas_base.md` está versionado; si no, el desarrollador lo sube (A1) | `CLAUDE.md` manda leer los dos y forman parte de la entrega |
| `node_modules/`, `dist/` | Dejar | Se generan solos |
| `/storage/`, `content/` | Dejar | Son pesados y tienen licencias |
| `.env.test` | Seguir versionándolo | Solo tiene la URL de `koma_test`, sin secretos |
| *(añadir)* `CLAUDE.local.md` | Añadir | Por si el desarrollador usa notas personales para Claude |
| *(añadir)* `coverage/` | Añadir solo si la cobertura escribe a disco | Se genera sola |

En `.dockerignore`, añadir `.claude`, `CLAUDE.md`, `docs` y `.github`. Ningún código de la app los lee: solo los citan comentarios y tests, y los tests no corren dentro de la imagen.

## 7. Actividad simulada (bots)

El diseño de `plan_mvp.md` («Pulido», idea 24) es bueno:

- todo pasa por la API real;
- una guarda impide lanzarlo contra donde no toca;
- las cuentas se reconocen por su correo `@demo.test`;
- hay un plan para retirarlas después de la demo.

Dos recomendaciones:

1. Escribir los tests `Seguridad:` de `demo-activity-guard.ts` antes que el propio script (test primero, con `/constructor`).
2. En la presentación y en el README, decir abiertamente que la actividad es simulada. Así unas estadísticas infladas no restan credibilidad, y queda como un ejemplo más de control.

Este plan de limpieza **no** implementa la actividad simulada: eso sigue en `plan_mvp.md`.

## 8. Plan de mejora por pasos

Congelación de funciones el 20-nov y entrega el 25-nov (`plan_mvp.md`, «Calendario»). El plazo real de entrega se ha ampliado unas tres semanas, pero **el 25-nov sigue siendo la fecha de trabajo**: el margen es para imprevistos, no para planificar con él (DL9). El paso B se hace completo.

- **Paso 0 · Preparación (en casa).** Comprobar que no hay trabajo sin subir, hacer una copia de `.claude/`, terminar la auditoría con `.claude/` delante y versionarlo tal cual como línea base.
- **Paso A · Una sesión, sin tocar el código de la app.** `.gitignore`, `.dockerignore`, la sección «Tests» de `CLAUDE.md`, los permisos y los hooks, y probarlo todo.
- **Paso B · Antes del 20-nov.** Skills, el auditor ampliado, los agentes revisados, la CI, `CLAUDE.md` al día y reorganizado, los avisos de TypeScript, los índices y la cobertura.
- **Paso C · Bloque 6 (20 – 25 nov).** El documento «Cómo trabajamos con IA», las cifras para la presentación, el aviso de la actividad simulada y la bitácora.

## 9. Decisiones del desarrollador

Llevan el prefijo DL para no confundirlas con las D1–D21 de `plan_mvp.md`. Ninguna tarea que dependa de una DL pendiente empieza sin su respuesta.

### Resueltas (13-nov)

| # | Decisión tomada |
| --- | --- |
| DL1 | `docs/modelo_datos.md` y `docs/ideas_base.md` son públicos: se quita la línea del `.gitignore` y, si alguno no está versionado, se sube |
| DL10 | No se crea la skill `nueva-funcionalidad`: se mejora el «Modo tarea» de `constructor` |
| DL11 | `.claude/maqueta/` no se sube a GitHub |
| DL12 | Las rutas locales se aceptan en `codex-estudio.md` (es histórico). En `frontend.md` se cambian por `.claude/maqueta/` antes del commit de la línea base |
| DL13 | `bloque5-propuesta.md` y `t13-stripe-online.md` se suben como evidencia. `.claude/parches/` queda fuera de git y no se vuelve a subir salvo necesidad clara del proyecto |
| — | El paso B se hace completo. El plazo real se ha ampliado, pero se trabaja con el 25-nov |

### Pendientes

| # | Decisión | Recomendación |
| --- | --- | --- |
| DL2 | ¿CI con GitHub Actions (carpeta nueva `.github/`)? | Sí |
| DL3 | ¿Se pasan a `.claude/encargos/` el encargo y los registros de `.git/codex-t13/`? | Sí, si no tienen datos privados |
| DL4 | ¿Se parte `CLAUDE.md` en raíz + `client/` + `server/`, y se actualiza «Guía para CLAUDE.md» de `plan_mvp.md`? | Sí |
| DL5 | ¿Se archivan los contratos de los bloques 1 a 4 en `docs/contratos_cerrados.md`? | Sí, después de la congelación o si sobra tiempo |
| DL6 | ¿Se activan los avisos de TypeScript de H9? Si aparecen errores, arreglarlos es tocar código de la app | Activarlos y decidir con la lista de errores delante |
| DL7 | Nombre del test del árbol de `CLAUDE.md`: no tiene RN y la convención exige `RN-xx` o `Seguridad:` | `Seguridad:` o una excepción a la convención |
| DL8 | ¿Se declaran en `.claude/settings.json` los plugins que espera el proyecto? | Sí, si se usan en los dos ordenadores |
| DL9 | Calendario: ¿se dejan el 20-nov y el 25-nov en `plan_mvp.md`, o se anota también la fecha oficial nueva? | Dejarlas como objetivo y anotar la fecha nueva como margen. Mientras no haya respuesta, valen el 20-nov y el 25-nov |

## 10. Checklist de tareas

Formato: **ID · título** (hallazgo) · **Quién:**
- **D** = desarrollador;
- **IA** = agente;
- **IA + DL** = el agente, tras la decisión indicada.

Al terminar una tarea: `[x]`, la fecha y una nota de una línea. Ninguna tarea se borra.

### Paso 0 · Preparación (en casa, antes de nada)

- [x] **0.1 · Trabajo sin subir** (sección 1, H6) · **D**. En el ordenador principal, comprobar `git status` y `git log origin/main..main`. Si hay cambios o commits, subirlos.
  - **Hecho cuando:** los dos ordenadores están en el mismo commit.
  - 2026-11-14 · Hecha por el desarrollador. En 0.4: `main` = `origin/main` (`d62ba1d`), pero `docs/ideas_base.md` sigue modificado sin commit (sección 12).
- [x] **0.2 · Copia de seguridad de `.claude/`** (H1) · **D**. Copiar la carpeta en un zip fuera del proyecto.
  - 2026-11-14 · Hecha por el desarrollador.
- [x] **0.3 · Revisión de secretos en `.claude/`** (sección 5) · 2026-11-13. Leídos los once archivos: no hay claves, contraseñas ni URLs de bases de datos reales; solo valores de ejemplo (`sk_test_…`, `whsec_…`) y la conexión local de pruebas. Las rutas locales con el nombre de usuario se tratan en DL12.
- [x] **0.4 · Segunda parte de la auditoría** (sección 1) · **IA**. Queda lo que solo se ve con el repositorio delante: `git ls-files docs/ .claude/`, `git status`, `docker-compose.yml` (versión de Postgres), `Dockerfile`, `.env.example` y los `tsconfig.json`.
  - **Hecho cuando:** la sección 12 está actualizada con lo encontrado y las diferencias se han avisado.
  - 2026-11-14 · Sección 12, «Con el repositorio delante»: se confirman las cifras y H6, H9 y H11; seis diferencias avisadas (la primera, que `develop` no existe).
- [x] **0.5 · Línea base del harness** (H1) · **D + IA**, en este orden:
  1. **D:** copiar el contenido de la maqueta (`koma_home`) a `.claude/maqueta/` en el repositorio principal, en los dos ordenadores (DL11, DL12).
  2. **IA:** dejar el `.gitignore` así. Se quitan `docs/modelo_datos.md` y `.claude`, y se añaden las cinco últimas líneas:

     ```
     .env
     .env.online
     node_modules/
     dist/
     /storage/
     content/
     docs/credenciales.local.md
     .claude/settings.local.json
     .claude/permiso-tests.txt
     .claude/maqueta/
     .claude/parches/
     CLAUDE.local.md
     ```
  3. **IA:** en `.claude/agents/frontend.md`, cambiar la ruta absoluta de la maqueta por `.claude/maqueta/` (DL12). Es el único cambio dentro de `.claude/` antes de la línea base.
  4. **IA:** entregar la lista de lo que entraría (`git status --short --untracked-files=all -- .claude docs`) y los comandos git. De `.claude/` deben entrar ocho archivos: los dos agentes, la skill `constructor`, los cuatro de `encargos/` y `t13-stripe-online.md`. Si aparece otro, parar y avisar.
  5. **D:** hacer el commit.
  - **Hecho cuando:** `.claude/` está en GitHub y cualquier cambio posterior se ve como diff.
  - 2026-11-14 · Maqueta copiada por el desarrollador en este ordenador (falta el otro); `.gitignore` y `frontend.md` (línea 26) cambiados; entran los ocho archivos previstos. Vale el commit local en `develop`; la comprobación en GitHub queda pendiente para el final.
- [x] **0.6 · Aprobación escrita de las carpetas nuevas** (sección 12) · **D**. `CLAUDE.md` y el `auditor` tratan como incumplimiento cualquier carpeta fuera del plan, y `.github/`, `.claude/skills/` y `.claude/hooks/` no están en la estructura de `docs/ideas_base.md`. El desarrollador anota la aprobación de este plan en «Decisiones» de `plan_mvp.md` o en `ideas_base.md`.
  - **Hecho cuando:** el `auditor` ya no puede marcar esas carpetas como fuera del plan.
  - 2026-11-14 · Hecha por el desarrollador: fila «Harness» en «Decisiones» de `docs/plan_mvp.md` (`ceec829`).

### Paso A · Candados y reglas (una sesión, sin tocar el código de la app)

- [ ] **A1 · `docs/ideas_base.md` y `docs/modelo_datos.md`** (H11, DL1) · **IA + D**. La línea del `.gitignore` ya se quitó en 0.5. Comprobar con `git ls-files docs/` que los dos están versionados; si falta alguno, entregar el `git add`.
- [ ] **A2 · `.dockerignore`** (H11) · **IA**. Hoy tiene ocho líneas (`.git`, `node_modules`, `**/dist`, `.env`, `.env.online`, `storage`, `content` y `docs/credenciales.local.md`). Se añaden `.claude`, `CLAUDE.md`, `docs`, `.github` y `plan_limpieza.md` (decisión del 14-nov, sección 12), y no se quita ninguna.
  - **Hecho cuando:** el desarrollador comprueba que `docker compose build` funciona y la app arranca en el contenedor.
- [ ] **A3 · Sección «Tests» en `CLAUDE.md`** (H2, H4) · **IA**. Debe recoger:
  - los tests existentes no se modifican ni se borran (tampoco `helpers.ts` ni `reading-fixtures.ts`);
  - la excepción solo con permiso del desarrollador, la aserción y el motivo explicados, y una entrada en la bitácora;
  - toda funcionalidad o corrección trae su test nuevo en el mismo commit;
  - test primero: se ve fallar antes de programar;
  - se mantiene el nombre por RN o `Seguridad:`.

  `CLAUDE.md` sigue en 150 líneas como máximo y sin perder ninguna regla. Si no cabe, se propone qué mover y se pregunta (ver B9).
- [ ] **A4 · Permisos del proyecto** (H3) · **IA**. En `.claude/settings.json`:
  - **deny:** leer `.env`, `.env.online` y `docs/credenciales.local.md`; `git add`, `git commit`, `git push`, `git reset`, `git rm`, `git restore`, `git clean`, `git stash` y `git checkout`;
  - **deny, BD local:** `docker compose down` (con o sin `-v`), `docker volume rm` y `docker compose rm`;
  - **ask:** `npm run seed:online`, `npm run content:import:online`, cualquier `…:online` futuro, `psql`, `npm run migrate`, `npm run seed`, `npm run content:import` y `npm run demo:data`;
  - **allow:** `npm test`, `npm run test:api` (solo reinicia `koma_test`: `reset-test-db` aborta si la BD no termina en `_test`), `npm run build`, `npm run typecheck`, `git status`, `git diff` y `git log`.

  Comprobar la sintaxis vigente en la documentación oficial de Claude Code; no inventarla.
  - **Hecho cuando:** tras reiniciar la sesión, un comando prohibido se bloquea y uno permitido pasa sin preguntar.
- [ ] **A5 · Hook `proteger-tests`** (H2) · **IA**. En *PreToolUse*:
  - bloquea Edit/Write/MultiEdit sobre cualquier archivo **existente** de `server/src/tests/`;
  - bloquea los comandos de shell que escriban, muevan o borren ahí (`sed -i`, `>`, `mv`, `rm`, `git checkout --`…);
  - permite crear archivos nuevos;
  - deja pasar solo los archivos listados en `.claude/permiso-tests.txt`, y bloquea a la IA si intenta crear, editar o borrar ese archivo.

  El mensaje de bloqueo explica la regla y el procedimiento de excepción. El filtro de comandos de shell es una ayuda, no una garantía: la garantía es la comprobación de resultado de A7.
  - **Hecho cuando:** pasan las pruebas de A9.
- [ ] **A6 · Hook `proteger-secretos`** (H3) · **IA**. En *PreToolUse*:
  - bloquea Read/Edit/Write sobre `.env`, `.env.online` y `docs/credenciales.local.md`;
  - bloquea los comandos de shell que muestren su contenido (`cat`, `type`, `head`, `grep`, `Get-Content`, `printenv`…);
  - **deja pasar** `--env-file=.env`, `--env-file-if-exists=.env`, `--env-file=.env.test` y `--env-file=.env.online` como argumento de `node`, porque los scripts de npm los usan (los `:online` siguen pasando por «preguntar» de A4).
  - **Hecho cuando:** pasan las pruebas de A9 y `npm run test:api` sigue funcionando.
- [ ] **A7 · Hook `verificar-al-terminar`** (H4) · **IA**. En *Stop*:
  - **primero, los tests protegidos:** si `git status --porcelain -- server/src/tests/` muestra un archivo modificado, borrado o renombrado (no los nuevos, `??`) que no está en `.claude/permiso-tests.txt`, impide cerrar y dice qué archivo es. Esto también salta si el desarrollador edita un test a mano sin listarlo: es intencionado;
  - si `git status --porcelain` muestra cambios en `server/` o `client/`, ejecuta `npm test`;
  - con fallos, impide cerrar y devuelve el resumen del error;
  - **antes de activarlo,** comprobar que `npm test` está en verde y medir cuánto tarda. Si pasa de unos 20 segundos, el hook guarda una huella de los cambios (hash de `git status --porcelain` y `git diff`) en la carpeta temporal del sistema, fuera del proyecto, y no repite los tests si nada ha cambiado desde la última vez en verde;
  - respeta `stop_hook_active`, para no entrar en bucle;
  - no ejecuta `test:api`, porque necesita Postgres.
- [ ] **A8 · Hook `inicio-sesion`** (H6) · **IA**. En *SessionStart*: muestra la línea «Bloque actual» de `CLAUDE.md`, `git status --short` y una línea con la regla de los tests. Si `.claude/permiso-tests.txt` existe y tiene entradas, avisa de que hay una excepción abierta (solo lee el archivo, no lo toca).
- [ ] **A8b · Hook de compilación tras editar** (sección 5, opcional) · **IA + D**. En *PostToolUse*, `npm run typecheck` tras editar un `.ts`. Se aplica solo si no ralentiza demasiado.
- [ ] **A9 · Prueba de los candados** (H2, H3) · **IA + D**. El desarrollador reinicia la sesión y la IA intenta:
  1. editar un test existente → bloqueado;
  2. crear un test nuevo → permitido;
  3. con el archivo listado por el desarrollador en `permiso-tests.txt` → permitido;
  4. leer `.env` → bloqueado;
  5. `git commit` → bloqueado;
  6. `npm run seed:online` → pregunta;
  7. terminar con un test unitario roto a propósito en un archivo nuevo de prueba → no deja cerrar (después se borra ese archivo);
  8. el desarrollador cambia a mano una línea de un test existente, sin listarlo → al terminar, no deja cerrar (después lo restaura él);
  9. `git stash` y `git restore` → bloqueados;
  10. el agente `auditor`, con Bash, intenta `sed -i` sobre un test existente y `cat .env` → bloqueados.
  - **Hecho cuando:** los 10 casos dan lo esperado y quedan anotados en la bitácora.
- [ ] **A10 · Entrada de bitácora del paso A** (H1–H4) · **IA**. Con la plantilla de `docs/bitacora.md`, el resultado de A9 y los comandos git.

### Paso B · Skills, agentes, CI y orden (antes del 20-nov)

- [ ] **B1 · Skills** (H8) · **IA**. Crear `cerrar-bloque`, `bitacora`, `encargo-codex` y `entregar-commit` en `.claude/skills/<nombre>/SKILL.md`. Cada una enlaza a la sección de `CLAUDE.md` o de `docs/` que aplica, en lugar de copiar reglas. `cerrar-bloque` incluye `/simplify` y `/code-review` (H9).
  - No se crea `nueva-funcionalidad` (DL10): ese flujo es el «Modo tarea» de `constructor`, que se mejora en B4.
  - `encargo-codex` parte de los tres encargos reales de `.claude/encargos/` (la misma estructura de seis apartados) y añade cuatro cosas: la regla de los tests y la de los secretos; que todo cambio en un test existente se entrega con la comprobación antes y después, para que el desarrollador lo autorice; que `.claude/` ya está en git (los encargos antiguos dicen lo contrario); y que el worktree no se borra hasta que su diff esté en `main` (bitácora, 2026-11-09: hubo que recuperar el trabajo de la sesión de Codex).
  - `bitacora`: la plantilla del principio de `docs/bitacora.md` (cinco campos, unas 10 líneas) no es la que usan las entradas reales (Pedido, Resultado, Tests, Comprobación y Limitaciones, y bastante más largas). Preguntar al desarrollador cuál de las dos sigue la skill.
  - **Hecho cuando:** tras reiniciar, cada skill aparece, y una ejecución de prueba de `bitacora` y de `entregar-commit` da el formato correcto.
- [ ] **B2 · Skills opcionales** (H8) · **IA + D**. `actividad-simulada` y `reemplazar-capitulos`, con los pasos de «Pulido» de `plan_mvp.md`. Solo describen los pasos: no ejecutan nada `:online`.
- [ ] **B3 · `auditor` ampliado** (H2, H4) · **IA**. Ampliar el apartado «F · Tests» que ya tiene `.claude/agents/auditor.md`. En el rango auditado, lista:
  - cada `assert` eliminado o cambiado en tests existentes;
  - cada `feat`/`fix` sin test nuevo;
  - cada test nuevo que pasaría también con el código anterior.
- [ ] **B4 · Agentes y skill `constructor` revisados** (secciones 5 y 12) · **IA**. Hay que mostrar el diff de cada archivo antes y después.
  - `auditor` y `frontend` conservan `tools: Read, Grep, Glob, Bash` (ver sección 5).
  - Poner al día lo desfasado con el bloque 5: `frontend` (punto 6) trata Open Graph como fase 2–3 y `auditor` (punto A) cita Discord, y los dos entraron en «Fase 2 · bloque 5» de `plan_mvp.md` (de Discord, solo el enlace). Los reportes están descartados, no aplazados.
  - `frontend`: la ruta de la maqueta es `.claude/maqueta/` desde 0.5 (DL12); comprobar que el agente la encuentra en los dos ordenadores.
  - `constructor`, «Modo tarea» (DL10): el test se escribe y se ve fallar antes del código (hoy va después del servicio), y se añade la regla de los tests existentes con su excepción. La regla de git se enlaza en lugar de copiarse. El «Modo andamiaje» ya no se usa: preguntar si se archiva.
  - Sin reglas copiadas de `CLAUDE.md`, sin restos y sin datos sensibles.
- [ ] **B5 · Encargos de Codex** (sección 5) · **IA + DL3**. Pasar los de `.git/codex-t13/` a `.claude/encargos/`, si se decide versionarlos. Mover también `.claude/t13-stripe-online.md` a `.claude/encargos/` (DL13), para que la raíz de `.claude/` solo tenga configuración.
- [ ] **B6 · Plugins declarados** (sección 5) · **IA + DL8**. Declarar en `.claude/settings.json` los plugins que espera el proyecto.
- [ ] **B7 · CI en GitHub Actions** (H5) · **IA + DL2**. `.github/workflows/tests.yml`:
  - Node 24 (24.2 o posterior, por `engines`) y servicio `postgres:18` (la versión que da `plan_mvp.md`; confirmarla en `docker-compose.yml`) con usuario `koma`, contraseña `koma` y BD `koma_test`;
  - `npm ci --include=dev`, `npm run typecheck`, `npm test` y `npm run test:api`;
  - crea un `.env` de CI con valores de prueba que no sean secretos (secretos de más de 32 caracteres inventados, `PAYMENTS_DRIVER=fake`, `STORAGE_DRIVER=local`…), sin tocar los scripts de `package.json`. Se parte de `.env.example`: `env.ts` exige todas sus variables no opcionales, y el seed de `reset-test-db` necesita las cuatro `SEED_*_PASSWORD` con 10 caracteres o más (RN-12).
  - Antes del primer push, `npm run typecheck` tiene que estar en verde en local (ver B11).
  - **Hecho cuando:** el primer push da verde en GitHub.
- [ ] **B8 · `CLAUDE.md` al día** (H6) · **IA**. Corregir el árbol (los archivos que faltan y los que sobran, según el estado real tras 0.1), añadir la fecha de congelación y `docs/comandos.md`, y poner una tabla de «quién hace qué» con agentes, skills y hooks. Sin perder reglas. `constructor` figura como skill, no como agente. Los archivos de la actividad simulada (`demo-activity*.ts` y `npm run demo:activity`) se quedan solo si ya existen: hoy `package.json` no tiene esos scripts, y el `auditor` exige que coincidan con la tabla de comandos (ver B10).
- [ ] **B9 · `CLAUDE.md` reorganizado** (H7) · **IA + DL4**. Raíz con lo común y 150 líneas como máximo; `client/CLAUDE.md` con las reglas del cliente; `server/CLAUDE.md` con las del servidor y las trampas. La «Definición de terminado» queda en una sola fuente. Además:
  - entregar la lista de reglas antes y después, que demuestre que no se pierde ninguna;
  - avisar de los 9 comentarios del código que citan secciones de `CLAUDE.md` (cambiarlos es código de la app: preguntar);
  - proponer el cambio de «Guía para CLAUDE.md» en `plan_mvp.md`.
- [ ] **B10 · Test del árbol de `CLAUDE.md`** (H6) · **IA + DL7**. Archivo **nuevo** en `server/src/tests/unit/` que comprueba que cada ruta del árbol de `CLAUDE.md` existe.
  - **Hecho cuando:** falla si se nombra un archivo inexistente y pasa con el árbol corregido de B8.
  - **Cuidado:** `CLAUDE.md` documenta por adelantado lo ya aprobado (hoy, la actividad simulada). El test tiene que convivir con eso: o el árbol solo nombra lo que existe, o el test admite una lista corta y explícita de «pendientes». Preguntar cuál.
- [ ] **B11 · Avisos de TypeScript** (H9) · **IA + DL6**. Añadir los cuatro avisos de H9 a `server/tsconfig.json` y `client/tsconfig.json`. El proyecto usa TypeScript 7.0.2: comprobar en su documentación que las cuatro opciones siguen llamándose así. Si aparecen errores, **no arreglarlos**: entregar la lista (archivo, línea, aviso), **quitar de nuevo los avisos** para no dejar el typecheck ni la CI en rojo, y esperar la decisión.
- [ ] **B12 · Índices** (H10) · **IA**. Un índice al principio de `docs/plan_mvp.md` y de `docs/bitacora.md`, sin cambiar el resto del contenido.
- [ ] **B13 · Contratos archivados** (H10) · **IA + DL5**. Mover los contratos de los bloques 1 a 4 a `docs/contratos_cerrados.md` y actualizar las referencias de `CLAUDE.md`. Antes de mover nada, buscar las referencias a esas secciones en `server/src`, `client/src`, `.claude/` y `docs/` y entregar la lista: las que estén en código de la app se preguntan.
- [ ] **B14 · Cobertura** (H11) · **IA**. Script `test:coverage` en `package.json` (solo en `scripts`) con la medición de cobertura de `node --test`, sin dependencias. Comprobar en la documentación de Node 24 el nombre exacto de la opción. Los tests unitarios solos darán un porcentaje bajo, porque casi todo el código lo cubren los de API: para C2, medir también `test:api` (con Postgres) y decir qué cifra es cuál. Si escribe a disco, añadir `coverage/` al `.gitignore`.
  - El `auditor` comprueba que los scripts de `package.json` son los de la tabla de comandos de `CLAUDE.md`: el script nuevo se añade a esa tabla dentro de una fila existente (no quedan líneas libres) y al README.
  - **Hecho cuando:** se obtiene el porcentaje.
- [ ] **B15 · Recordatorio de la actividad simulada** (sección 7) · **D**. Cuando se construya (fuera de este plan), usar `/constructor`: primero los tests `Seguridad:` de la guarda.
- [ ] **B16 · Entrada de bitácora del paso B** · **IA**.

### Paso C · Para la entrega (bloque 6, 20 – 25 nov)

- [ ] **C1 · «Cómo trabajamos con IA»** (sección 2) · **IA**. `docs/harness.md`, o una sección del README:
  - un esquema del flujo (plan → contrato → test → constructor → `frontend`/`auditor` → bitácora → commit del desarrollador);
  - qué hace cada agente, skill, hook y permiso, y por qué;
  - cómo desactivar un hook en una emergencia;
  - ejemplos reales de la bitácora. Por ejemplo, el auditor detectó que `/files/%E0%A4%A` y `?q=%00` daban 500.
- [ ] **C2 · Cifras para la presentación** (sección 2) · **IA**. Número de tests (unitarios y de API), cobertura (B14), auditorías pasadas y hallazgos corregidos (contados en la bitácora), commits y bloques cerrados.
- [ ] **C3 · Actividad simulada declarada** (sección 7) · **IA + D**. Una frase en el README y en el guion de la demo diciendo que la actividad de las cuentas `@demo.test` es simulada.
- [ ] **C4 · Entrada de bitácora del paso C** · **IA**.
- [ ] **C5 · Después de la entrega** (H9) · **D decide**. Partir `author.ts`, `admin.ts` y `reader.ts` con tests delante. No antes del 20-nov salvo aprobación expresa.

---

## 11. Instrucciones para el agente

Esta sección es para un agente que llega **sin contexto previo**. Léela entera antes de tocar nada.

### Cómo tomar este documento

1. **Orden de lectura:** `CLAUDE.md` completo → este documento completo → solo las secciones de `docs/` que cite la tarea en curso.
2. **Es un plan, no un permiso en blanco.** El desarrollador lo revisa y lo aprueba en su conjunto, pero:
   - las tareas marcadas **D** las hace él;
   - las marcadas **DL** esperan su decisión;
   - si dudas de algo, pregunta.
3. **`CLAUDE.md` sigue vigente en todo:** git solo lo maneja el desarrollador, no se añaden dependencias, se pregunta lo que no está especificado y se avisa de las contradicciones. Si este documento y `CLAUDE.md` chocan, manda `CLAUDE.md` hasta que el desarrollador diga otra cosa: avisa, no elijas en silencio.
4. **Lo que encuentres manda.** Este documento se contrastó el 13-nov con los archivos de la sección 12, pero no con el código ni con el estado de git. Si algo no coincide, actualiza la sección afectada y avisa (tarea 0.4).
5. **El progreso se apunta aquí:** `[x]`, la fecha y una nota por tarea. No borres tareas ni reescribas las secciones 1–9, salvo para corregir un dato que hayas comprobado (y lo dices).

### Qué puedes tocar con este plan

En este plan **sí puedes modificar archivos clave de configuración y de estructura**, con estas condiciones:

| Archivo o carpeta | Condición |
| --- | --- |
| `.claude/settings.json`, `.claude/agents/`, `.claude/skills/`, `.claude/hooks/`, `.claude/encargos/` | Solo después de 0.5 (línea base en git). Única excepción: el cambio de ruta de `frontend.md` del propio 0.5 |
| `CLAUDE.md` y los nuevos `client/CLAUDE.md` y `server/CLAUDE.md` | Sin perder reglas, con la lista de reglas antes y después; la raíz con 150 líneas como máximo |
| `.gitignore`, `.dockerignore` | Solo las líneas de las secciones 6 y 9 |
| `.github/workflows/` | Solo tras DL2 |
| `server/tsconfig.json`, `client/tsconfig.json` | Solo los avisos de B11, tras DL6 |
| `package.json` | Solo dentro de `scripts` (B14). Nunca `dependencies`, `devDependencies` ni `engines` |
| `README.md` | Solo la fila de comandos de B14 y la frase de C3 |
| `docs/plan_limpieza.md` (este), `docs/bitacora.md` (solo entradas nuevas), `docs/harness.md` (nuevo) | — |
| Índices de `docs/plan_mvp.md` y `docs/bitacora.md`, `docs/contratos_cerrados.md` | Solo B12 y, tras DL5, B13 |
| `server/src/tests/` | Solo archivos **nuevos** |

### Qué no puedes tocar nunca (aunque una tarea parezca pedirlo)

- **Secretos:** `.env`, `.env.online` y `docs/credenciales.local.md`. No los leas, copies, muestres ni edites, y no imprimas variables de entorno con secretos. Si un dato sensible aparece en otro archivo, cita solo archivo, línea y tipo de dato, nunca el valor.
- **Tests existentes:** no los modifiques ni los borres, incluidos `helpers.ts` y `reading-fixtures.ts`. Tampoco crees, edites ni borres `.claude/permiso-tests.txt`: ese archivo es solo del desarrollador.
- **El resto del proyecto:** el código de la app (`server/src` y `client/`), las migraciones, `content/`, `storage/`, `Dockerfile`, `docker-compose.yml`, `.claude/settings.local.json`, `.claude/maqueta/` y `.claude/parches/`. Dentro de `server/` y `client/` solo hay cuatro excepciones: tests nuevos, `client/CLAUDE.md` y `server/CLAUDE.md` (B9) y los dos `tsconfig.json` (B11).
- **Git y producción:** comandos que escriban en git (`add`, `commit`, `push`, `rm`, `reset`, `restore`, `clean`, `checkout`, `stash`). Entrega los comandos. Tampoco ejecutes nada `:online` ni `psql` contra Neon.
- **La base de datos local de desarrollo (`koma`) y su volumen de Docker:** no se tocan en este plan. Nada de `docker compose down` (con o sin `-v`), `docker volume rm`, `docker compose rm`, `psql`, `DROP`, ni `npm run migrate`, `seed`, `content:import` o `demo:data`. Ninguna tarea los necesita. La única base que puedes usar es `koma_test`, a través de `npm run test:api`. Si Postgres no está levantado, pídeselo al desarrollador (`docker compose up -d db`).
- **Los candados:** no desactives, rodees ni «arregles» un hook o un permiso que te bloquea. Si un candado te para, te detienes y avisas: es el sistema funcionando.

### Cómo trabajar cada tarea

1. **Orden:** una tarea a la vez, en el orden del checklist (0 → A → B → C). El paso A no empieza hasta que 0.5 esté hecho: sin la línea base en git, tus cambios en `.claude/` no tienen diff que revisar.
2. **Antes:** di qué archivos vas a tocar y qué vas a cambiar. Si la tarea depende de una DL sin respuesta, pregunta y espera.
3. **Al editar un archivo clave:** léelo entero primero. Haz cambios mínimos: no reformatees ni reescribas lo que funciona, y no mejores nada fuera del alcance de la tarea.
4. **Al reorganizar** (`CLAUDE.md`, agentes): entrega la lista de reglas antes y después y demuestra que no se pierde ninguna. Es el mismo criterio del commit `dc3e35d` («de 155 a 149 líneas sin quitar reglas»).
5. **Después:**
   - ejecuta `npm run typecheck` y `npm test`;
   - si el cambio puede afectar a la API o a la BD, pide al desarrollador `npm run test:api` (necesita Postgres);
   - para hooks, permisos, agentes y skills, pide al desarrollador que reinicie la sesión y pruébalos: un agente o una skill nuevos no se cargan hasta la sesión siguiente (bitácora, 2026-11-02).
6. **Al cerrar:** marca la tarea aquí y entrega los comandos `git add` y `git commit` con el formato del proyecto (por ejemplo, `chore(claude): permisos y hooks de protección de tests y secretos`). Al final de cada paso, escribe la entrada de bitácora (A10, B16, C4).

### Cuidado con los hooks y los permisos

Un candado mal hecho puede dejar al desarrollador sin poder trabajar.

- **Los scripts:** `.mjs` de Node, sin dependencias, para Windows y Linux. Normaliza las rutas (`\` y `/`) y compáralas sin depender de mayúsculas en Windows.
- **Pruébalos antes de activarlos:** cada hook, con casos que deben bloquear y casos que deben pasar (A9).
- **No rompas el trabajo normal:**
  - `npm run dev`, `npm run test:api` y los scripts con `--env-file=.env` deben seguir funcionando;
  - el hook *Stop* no puede entrar en bucle (`stop_hook_active`) y solo actúa si hay cambios en `server/` o `client/`.
- **La desactivación de emergencia es del desarrollador** (por ejemplo, `/hooks` o editando `.claude/settings.json`). Déjala explicada en C1.

### Cuándo parar y preguntar

- Lo que hay en `.claude/` no coincide con este documento.
- Una tarea exige tocar un test existente, código de la app o algo de la lista prohibida.
- Después de tu cambio falla el typecheck o un test, y la causa no está en lo que tocaste.
- Un hook o un permiso bloquearía el trabajo diario del desarrollador.
- `CLAUDE.md`, `docs/` y este documento se contradicen.
- Te falta información para una tarea: pregunta antes de suponer (`CLAUDE.md`: «Si algo no está especificado, preguntar antes de implementarlo»).

### Advertencias adicionales

**Sobre los candados**

- **Un hook que falla no protege.** Un script que se rompe (ruta mal escrita, JSON de entrada inesperado) normalmente no bloquea nada, y el candado queda abierto sin avisar. Comprueba en la documentación oficial qué código de salida bloquea y cuál no, envuelve cada script en `try/catch` y haz que `proteger-tests` y `proteger-secretos` bloqueen también cuando fallan por dentro, con un mensaje que lo diga.
- **Los candados no se protegen a sí mismos.** Tú puedes editar `.claude/hooks/` y `.claude/settings.json`. Desde que A9 esté en verde, cualquier cambio en esos archivos se enseña antes como diff y espera el «sí» del desarrollador, aunque la tarea lo permita.
- **Codex no pasa por estos candados.** Los hooks y los permisos son de Claude Code. Codex trabaja en un worktree sin `.env` y, según sus encargos, sin leer fuera de él, así que los secretos le quedan lejos; pero sí puede editar tests. Además, los encargos de diseño le permiten cambiar `server/src/tests/api/pages.test.ts` con justificación (E1 lo exige para la mascota). Cuando traigas ese diff a `main`, el candado saltará: es lo esperado. El desarrollador revisa la comprobación que cambia y lista ese archivo en `permiso-tests.txt` para esa integración. Volverá a pasar en E2–E4.
- **Los subagentes deberían pasar por los mismos candados, pero compruébalo.** `auditor` y `frontend` tienen Bash: es el caso 10 de A9. `constructor` es una skill y corre en la sesión principal.
- **Si `npm test` ya estaba en rojo antes de tu cambio,** no actives el hook *Stop*: avisa. Un candado que nace bloqueado obliga a desactivarlo el primer día.
- **Rutas en Windows.** Comprueba cómo se escribe la ruta del script en el comando del hook para que funcione igual en los dos ordenadores, y pruébalo en ambos antes de dar A9 por hecho.

**Sobre subir `.claude/` a GitHub (0.3 y 0.5)**

- **El orden no se puede invertir:** primero 0.3, después 0.5. Lo que llega a GitHub se queda en el historial aunque luego se borre el archivo.
- **Un secreto encontrado en 0.3 no se arregla borrándolo:** hay que cambiar esa clave en el servicio (Neon, R2, Stripe). Díselo al desarrollador, sin mostrar el valor.
- **Antes del commit de 0.5,** entrega la lista completa de archivos que entrarían (`git status --short --untracked-files=all -- .claude` después de cambiar el `.gitignore`) para que el desarrollador la revise. Fíjate en registros, worktrees, transcripciones y archivos grandes: no son harness y no deben subir.

**Sobre el orden y el ritmo**

- **El pulido va primero.** `plan_mvp.md` da prioridad a un encargo de Codex entregado sobre el resto del trabajo. Si llega uno a mitad de una tarea de este plan, cierra la tarea o déjala apuntada aquí, y atiende el encargo.
- **Un paso por sesión como mucho.** Al empezar una sesión, lee el checklist y continúa en la primera tarea sin marcar. Si la sesión se alarga, cierra la tarea en curso, apúntala aquí y para: es mejor una sesión nueva que seguir con el contexto lleno.
- **El paso B, en este orden recomendado:** B8 → B10 → B11 → B7 → B1 → B3 → B4 → el resto. Así la CI nace con el árbol de `CLAUDE.md` corregido y con el typecheck en verde. B9 y B13 van al final, porque mueven texto que otras tareas citan.
- **B9 es la tarea con más riesgo.** Hazla en una sesión propia, con B8 y B10 ya cerradas, y no la mezcles con ninguna otra.
- **El calendario no cambia para ti.** Mientras DL9 no tenga respuesta, trabaja con el 20-nov y el 25-nov. El margen nuevo no autoriza a adelantar C5 ni a partir archivos grandes.
- **Cada tarea, un commit.** Entrega los comandos por separado para que cada cambio del harness se pueda revertir solo.

**Sobre este documento**

- Los números de la sección 1 y de la tabla de la sección 2 (líneas, tests, commits) son del commit `d62ba1d`. Si los vas a usar en C2, vuelve a contarlos.
- Si una tarea te parece mal planteada con lo que ves en el repositorio, dilo antes de hacerla. Cumplir al pie de la letra una tarea equivocada también es un fallo.

---

## 12. Contraste con los archivos reales

**Fuentes (13-nov):** `CLAUDE.md`, `docs/plan_mvp.md`, `docs/comandos.md`, `package.json`, `.gitignore`, `.dockerignore` y los once archivos de `.claude/`, leídos enteros. `docs/bitacora.md`, solo por búsquedas (títulos de las entradas, plantilla y los términos hook, skill, plugin, worktree, permiso, reinicio y sesión siguiente): no se ha leído entera.

### Se confirma

| Hallazgo | Dato |
| --- | --- |
| H1 | `.gitignore` tiene la línea `.claude` |
| H2 y H4 | `CLAUDE.md` no tiene ninguna regla sobre modificar tests. `plan_mvp.md` solo pide los tests de cada RN «antes de cerrar su bloque» |
| H3 | No hay permisos ni hooks: el único archivo de configuración es `settings.local.json`, con una carpeta adicional |
| H6 | `CLAUDE.md` tiene 149 líneas, no dice la fecha de congelación y su árbol no nombra `docs/comandos.md` |
| H7 | El agente `frontend` ocupa las cuatro últimas líneas de `CLAUDE.md`; `auditor` y `constructor` solo aparecen por su nombre |
| H11 | `.gitignore` lista `docs/modelo_datos.md`; `.dockerignore` no excluye `.claude`, `CLAUDE.md` ni `docs` |
| Sección 11 | Bitácora, 2026-11-02: un agente nuevo no se carga hasta la sesión siguiente. La presentación se hace desde un portátil con Windows (`docs/comandos.md`, apartado 10), así que los hooks tienen que funcionar en Windows y en Linux |

### Cambia respecto a lo supuesto al principio

| Se suponía | Realidad | Dónde se ha corregido |
| --- | --- | --- |
| Tres agentes | Dos agentes y una skill: `constructor` se lanza con `/constructor` y no se invoca sola (`disable-model-invocation: true`) | Secciones 2 y 5, B4, B8 |
| No hay skills | Hay una, y su «Modo tarea» ya cubre el flujo de `nueva-funcionalidad` | DL10, B1, B4 |
| Revisores de solo lectura: por comprobar | Tienen `tools` limitado, pero con Bash | Sección 5, A9 (caso 10) |
| Encargos en `.git/codex-t13/` | Solo el de T13. Los demás, en `.claude/encargos/` | Sección 5, B5 |
| `.claude/` solo contiene harness | También `parches/` y dos documentos de trabajo | DL13, 0.5 |
| El auditor no tiene apartado de tests | Tiene «F · Tests» | B3 |
| Archivos «que no existen» = trabajo sin subir | En parte es documentación adelantada de la actividad simulada | Sección 1, B8, B10 |

### Hallazgos nuevos

1. **Los agentes están desfasados con el bloque 5.** `frontend` marcaría Open Graph como bloqueante (lo lista como fase 2–3) y `auditor` cita Discord entre lo prohibido. Los dos entraron en el bloque 5 (B4).
2. **La regla «los tests no se tocan» coincide con el pulido en curso.** Los encargos de diseño permiten cambiar `pages.test.ts`. Es la excepción prevista, y hay que esperarla en cada encargo (sección 11).
3. **Carpetas nuevas sin aprobación escrita.** `.github/`, `.claude/skills/` y `.claude/hooks/` no están en `docs/ideas_base.md`, y el `auditor` las marcaría (0.6).
4. **La tabla de comandos de `CLAUDE.md` ya no coincide con `package.json`:** nombra `demo:activity` y `demo:activity:online`, que no existen. El `auditor` lo comprueba. `test:coverage` tiene que entrar en esa tabla (B8, B14).
5. **La maqueta no está en el repositorio principal.** `frontend.md` la busca en una ruta absoluta del ordenador principal, así que en el segundo ordenador ese agente no puede comparar. Se resuelve con la copia en `.claude/maqueta/` (0.5).
6. **Los encargos antiguos dicen que `.claude/` no va a ningún commit.** No se editan (son históricos), pero los nuevos tienen que decir lo contrario (B1).
7. **Un worktree de Codex se borró antes de integrar su trabajo** (bitácora, 2026-11-09). Pasa a ser un paso de la skill `encargo-codex` (B1).
8. **`package.json` usa `--env-file=.env`, `--env-file-if-exists=.env` y `--env-file=.env.online`:** el hook de secretos tiene que dejar pasar los tres (A6).
9. **La plantilla de la bitácora y las entradas reales no coinciden** (B1).
10. **El proyecto usa TypeScript 7.0.2** (B11).
11. **`docs/comandos.md` nombra el equipo de desarrollo en la red local.** Ya está publicado. Si molesta, el desarrollador lo cambia por `<nombre-del-equipo>`; no es tarea de este plan.

### Condiciones de la ejecución (14-nov, del desarrollador)

Mandan sobre la sección 10 donde difieran:

- Se trabaja en la rama `develop` del repositorio local. Git lo maneja el desarrollador: la IA no cambia de rama ni escribe en git.
- Nada se sube a GitHub hasta terminar el plan. Donde un «Hecho cuando» diga «está en GitHub» o «el primer push da verde», vale el commit local en `develop`, y la comprobación en GitHub se anota en la tarea como pendiente para el final.
- DL2–DL9 no se dan por tomadas: al llegar a una tarea que dependa de una, se pregunta y se espera.

### Con el repositorio delante (tarea 0.4, 14-nov)

**Fuentes:** `git status`, `git branch -a`, `git worktree list`, `git ls-files docs/ .claude/`, el listado de `.claude/`, `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.env.example`, las claves de `server/src/config/env.ts`, los tres `tsconfig.json` y `package.json`. `npm run typecheck` y `npm test` en verde: 184 tests en 1 s, con la compilación ya hecha (dato para A7).

**Se confirma:**

| Punto | Dato |
| --- | --- |
| Cifras de las secciones 1 y 2 | `CLAUDE.md` 149 líneas, `plan_mvp.md` 1.611, `bitacora.md` 1.286; 28 archivos de tests unitarios y 39 de API, más `helpers.ts` y `reading-fixtures.ts` |
| `.claude/` | Los once archivos de la sección 1; sin `settings.json`, hooks ni `maqueta/`. Con el `.gitignore` de 0.5 entrarían los ocho previstos |
| DL1 · A1 | `docs/ideas_base.md` y `docs/modelo_datos.md` ya están versionados; la línea del `.gitignore` no hace nada |
| H6 | No existen `demo-activity.ts`, `demo-activity-guard.ts` ni `server/src/db/seeds/`; sí `docs/comandos.md`, `client/src/services/admin.ts`, `services/payments.ts` y `utils/admin.ts`. `seeds/` nunca ha existido en git: el seed vive en `server/src/scripts/seed.ts` |
| H9 · B11 | Ningún `tsconfig.json` tiene los cuatro avisos; `typescript` 7.0.2 |
| H11 · A2 | `Dockerfile` hace `COPY . .` y `.dockerignore` tiene las ocho líneas de A2, así que hoy la imagen ya copia `.claude/`. Ni `server/src` ni `client/src` leen `docs/` ni `CLAUDE.md` (solo los citan en comentarios): excluirlos no rompe la imagen |
| B7 | `postgres:18`, usuario y contraseña `koma`; `docker/initdb/01-test-db.sql` crea `koma_test`. `env.ts` exige `JWT_SECRET` y `COOKIE_SECRET` de 32 caracteres o más (los de `.env.example` son más cortos); `R2_*`, `STRIPE_*` y `SEED_*` son opcionales para `env.ts`. `.env.example` tiene las mismas claves que `env.ts` |

**Diferencias con el plan (avisadas el 14-nov):**

| # | Diferencia | Efecto |
| --- | --- | --- |
| 1 | La rama actual es `main`; `develop` no existe ni en local ni en `origin` | Resuelto: el desarrollador creó `develop` (commit de 0.4, `d520493`) |
| 2 | `docs/ideas_base.md` tiene cambios sin commit (sección «Pulido» e ideas 23 y 24); no incluye la aprobación de 0.6 | Resuelto: commit aparte del desarrollador (`3c11850`, en `develop`) |
| 3 | El plan está en la raíz (`plan_limpieza.md`), no en `docs/` | Donde diga `docs/plan_limpieza.md`, vale la raíz. Decidido: A2 añade también `plan_limpieza.md` al `.dockerignore` |
| 4 | Worktree de Codex `../koma-premium` (`feat/premium-diseno`, `25d7070`), limpio y ya integrado en `main` | Lo retira el desarrollador; la IA no lo toca |
| 5 | En `frontend.md`, la única ruta absoluta es la línea 26. Las líneas 3, 28 y 86 nombran `koma_home`, y las rutas de su tabla son relativas a la raíz de la maqueta | 0.5, paso 3: basta con la línea 26 si la copia deja las carpetas de la maqueta directamente en `.claude/maqueta/` |
| 6 | `codex-estudio.md` (línea 11) dice que git ignora `ideas_base.md` y `modelo_datos.md`, pero los dos están versionados | Histórico, no se edita (DL12). Los encargos nuevos no deben repetirlo (B1) |

### Sin ver

- El código de `server/` y `client/` (solo se buscaron las referencias a `docs/` y `CLAUDE.md`, y las claves de `env.ts`).
- El contenido de `.git/codex-t13/` (DL3, B5): siete archivos, entre ellos dos registros (`dev.log` y `run-2.log`, de 418 KB) que hay que revisar por si tienen datos privados antes de decidir DL3.
- Los encargos E2–E4, si ya están escritos fuera de `.claude/encargos/`.
