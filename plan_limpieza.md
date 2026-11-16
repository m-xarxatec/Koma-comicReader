# Plan de limpieza del harness · Koma

- **Fecha:** 2026-11-13. **Base revisada:** commit `d62ba1d` (copia del repositorio en el segundo ordenador).
- **Estado:** versión definitiva, aprobada por el desarrollador el 2026-11-13 para ejecutarse. Lo aplicado está marcado en la sección 10; las condiciones de la ejecución, en la sección 12.
- **Contrastado con:** `CLAUDE.md`, `docs/plan_mvp.md`, `docs/comandos.md`, `package.json`, `.gitignore`, `.dockerignore` y el contenido completo de `.claude/` (sección 12). Decisiones DL1–DL13 resueltas; DL9, la última, el 16-nov (sección 9).
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
| DL2 | ¿CI con GitHub Actions (carpeta nueva `.github/`)? | Sí. **Resuelta el 14-nov:** sí (B7) |
| DL3 | ¿Se pasan a `.claude/encargos/` el encargo y los registros de `.git/codex-t13/`? | Sí, si no tienen datos privados. **Resuelta el 14-nov:** sí, solo el encargo; los registros no (B5) |
| DL4 | ¿Se parte `CLAUDE.md` en raíz + `client/` + `server/`, y se actualiza «Guía para CLAUDE.md» de `plan_mvp.md`? | Sí. **Resuelta el 15-nov:** sí, con condiciones: la raíz se queda con lo común, lo dudoso y el árbol entero, en 150 líneas como máximo; la «Guía» y la definición de terminado de `plan_mvp.md` (manda la de `CLAUDE.md`) se cambian con permiso aparte (B9) |
| DL5 | ¿Se archivan los contratos de los bloques 1 a 4 en `docs/contratos_cerrados.md`? | Sí, después de la congelación o si sobra tiempo. **Resuelta el 15-nov:** después de la congelación (B13 aplazada) |
| DL6 | ¿Se activan los avisos de TypeScript de H9? Si aparecen errores, arreglarlos es tocar código de la app | Activarlos y decidir con la lista de errores delante. **Resuelta el 14-nov:** los cuatro activados; se borra el único error, un tipo sin usar (B11) |
| DL7 | Nombre del test del árbol de `CLAUDE.md`: no tiene RN y la convención exige `RN-xx` o `Seguridad:` | `Seguridad:` o una excepción a la convención. **Resuelta el 14-nov:** `Seguridad:` (B10) |
| DL8 | ¿Se declaran en `.claude/settings.json` los plugins que espera el proyecto? | Sí, si se usan en los dos ordenadores. **Resuelta el 14-nov:** no se declara ninguno; se anota para C1 (B6) |
| DL9 | Calendario: ¿se dejan el 20-nov y el 25-nov en `plan_mvp.md`, o se anota también la fecha oficial nueva? | Dejarlas como objetivo y anotar la fecha nueva como margen. Mientras no haya respuesta, valen el 20-nov y el 25-nov. **Resuelta el 16-nov:** entrega el 30-nov y congelación el 25-nov, con el bloque 6 (Comunidad y Tutoriales) antes de la pasada de diseño (`plan_mvp.md`, «Calendario») |

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

- [x] **A1 · `docs/ideas_base.md` y `docs/modelo_datos.md`** (H11, DL1) · **IA + D**. La línea del `.gitignore` ya se quitó en 0.5. Comprobar con `git ls-files docs/` que los dos están versionados; si falta alguno, entregar el `git add`.
  - 2026-11-14 · `git ls-files docs/` en `develop`: los dos versionados y sin la línea en el `.gitignore`. No hace falta ningún `git add`.
- [x] **A2 · `.dockerignore`** (H11) · **IA**. Hoy tiene ocho líneas (`.git`, `node_modules`, `**/dist`, `.env`, `.env.online`, `storage`, `content` y `docs/credenciales.local.md`). Se añaden `.claude`, `CLAUDE.md`, `docs`, `.github` y `plan_limpieza.md` (decisión del 14-nov, sección 12), y no se quita ninguna.
  - **Hecho cuando:** el desarrollador comprueba que `docker compose build` funciona y la app arranca en el contenedor.
  - 2026-11-14 · Cinco líneas añadidas al final, ninguna quitada; en `server/src` y `client/src` esas rutas solo salen en comentarios. Typecheck y 184 tests en verde; el desarrollador comprobó el build y el arranque en el contenedor.
- [x] **A3 · Sección «Tests» en `CLAUDE.md`** (H2, H4) · **IA**. Debe recoger:
  - los tests existentes no se modifican ni se borran (tampoco `helpers.ts` ni `reading-fixtures.ts`);
  - la excepción solo con permiso del desarrollador, la aserción y el motivo explicados, y una entrada en la bitácora;
  - toda funcionalidad o corrección trae su test nuevo en el mismo commit;
  - test primero: se ve fallar antes de programar;
  - se mantiene el nombre por RN o `Seguridad:`.

  `CLAUDE.md` sigue en 150 líneas como máximo y sin perder ninguna regla. Si no cabe, se propone qué mover y se pregunta (ver B9).
  - 2026-11-14 · «## Tests» tras «Comandos», con las dos líneas de tests que ya estaban allí y dos reglas nuevas. Sale el bloque del agente `frontend` (4 líneas), que ya está en `.claude/agents/frontend.md` (descripción, «Límites», «Alcance» e «Informe»). Se queda en 149 líneas: no hizo falta la excepción de pasar de 150 que autorizó el desarrollador. «Guía para CLAUDE.md» de `plan_mvp.md` no tiene esta sección (B9).
- [x] **A4 · Permisos del proyecto** (H3) · **IA**. En `.claude/settings.json`:
  - **deny:** leer `.env`, `.env.online` y `docs/credenciales.local.md`; `git add`, `git commit`, `git push`, `git reset`, `git rm`, `git restore`, `git clean`, `git stash` y `git checkout`;
  - **deny, BD local:** `docker compose down` (con o sin `-v`), `docker volume rm` y `docker compose rm`;
  - **ask:** `npm run seed:online`, `npm run content:import:online`, cualquier `…:online` futuro, `psql`, `npm run migrate`, `npm run seed`, `npm run content:import` y `npm run demo:data`;
  - **allow:** `npm test`, `npm run test:api` (solo reinicia `koma_test`: `reset-test-db` aborta si la BD no termina en `_test`), `npm run build`, `npm run typecheck`, `git status`, `git diff` y `git log`.

  Comprobar la sintaxis vigente en la documentación oficial de Claude Code; no inventarla.
  - **Hecho cuando:** tras reiniciar la sesión, un comando prohibido se bloquea y uno permitido pasa sin preguntar.
  - 2026-11-14 · 19 deny, 9 ask y 7 allow, con la sintaxis de code.claude.com/docs/en/permissions (`Read(/ruta)` anclado a la raíz; `Bash(cmd *)` cubre también el comando sin argumentos). Añadidas `docker compose * down` y `* rm` para la forma con `-f` de `docs/comandos.md`. Activo sin reiniciar: `git stash list` bloqueado; `npm test` (184) y `npm run test:api` (310) en verde. La regla solo ve el texto del comando (`git -C . push`, `sh -c`, `node --env-file=.env.online …` directo o `grep -r` no la activan): eso es de A5 y A6. Pendiente para A9, ya reiniciado y en modo normal (esta sesión estaba en modo auto): comprobar que lo permitido pasa sin preguntar.
- [x] **A5 · Hook `proteger-tests`** (H2) · **IA**. En *PreToolUse*:
  - bloquea Edit/Write/MultiEdit sobre cualquier archivo **existente** de `server/src/tests/`;
  - bloquea los comandos de shell que escriban, muevan o borren ahí (`sed -i`, `>`, `mv`, `rm`, `git checkout --`…);
  - permite crear archivos nuevos;
  - deja pasar solo los archivos listados en `.claude/permiso-tests.txt`, y bloquea a la IA si intenta crear, editar o borrar ese archivo.

  El mensaje de bloqueo explica la regla y el procedimiento de excepción. El filtro de comandos de shell es una ayuda, no una garantía: la garantía es la comprobación de resultado de A7.
  - **Hecho cuando:** pasan las pruebas de A9.
  - 2026-11-14 · `.claude/hooks/proteger-tests.mjs` y `hooks.PreToolUse` en `.claude/settings.json`, con la sintaxis de code.claude.com/docs/en/hooks: matcher `Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell` (con `Bash` también vigila Monitor), forma exec `node` + `${CLAUDE_PROJECT_DIR}` (vale en Windows), `exit 2` para bloquear y `onFailure: "block"` (Claude Code 2.1.325), así que un fallo interno, de arranque o de tiempo también bloquea. «Existente» = versionado en HEAD (decisión del desarrollador): los tests nuevos sin commit se crean, se editan y se borran; A7 debe tratar igual los nuevos ya añadidos al índice (`A`). Arnés de 120 casos fuera del repositorio (72 bloquean, 48 pasan; el más lento, 31 ms), en verde antes de activarlo; activo sin reiniciar (una sonda inofensiva, `rm --help`, se bloqueó). Typecheck y 184 tests en verde. No ve scripts en archivo, `git apply`/`patch` sin rutas, `while read` ni `git reset --hard`/`git stash` sin rutas (los dos últimos los para A4): eso queda para A7. Pendiente para A9: casos 1–3 y 10 en una sesión nueva, y en Windows (PowerShell solo se ha probado en Linux).
- [x] **A6 · Hook `proteger-secretos`** (H3) · **IA**. En *PreToolUse*:
  - bloquea Read/Edit/Write sobre `.env`, `.env.online` y `docs/credenciales.local.md`;
  - bloquea los comandos de shell que muestren su contenido (`cat`, `type`, `head`, `grep`, `Get-Content`, `printenv`…);
  - **deja pasar** `--env-file=.env`, `--env-file-if-exists=.env` y `--env-file=.env.test` como argumento de `node`, porque los scripts de npm los usan. `--env-file=.env.online` usado directamente con `node` devuelve «ask» (decisión del desarrollador, 14-nov: cierra el hueco que dejó A4); `npm run …:online` sigue pasando por el «preguntar» de A4.
  - **Hecho cuando:** pasan las pruebas de A9 y `npm run test:api` sigue funcionando.
  - 2026-11-14 · En dos commits (decisión del desarrollador). **1)** El analizador de comandos pasa de `proteger-tests.mjs` a `.claude/hooks/shell.mjs`, sin cambios de comportamiento: la salida (código, stdout y stderr) es idéntica en los 120 casos de A5. Los dos hooks lo cargan con `import()` dinámico; si falta o no carga, bloquean con un mensaje claro (dos casos más por hook). **2)** `.claude/hooks/proteger-secretos.mjs`, en un segundo grupo `PreToolUse` (matcher `Read|Edit|Write|MultiEdit|NotebookEdit|Grep|Bash|PowerShell`, `onFailure: "block"`). Cubre los secretos por su nombre en cualquier carpeta (`.env`, `.env.online` y `credenciales.local.md`) y `/proc/*/environ`. Bloquea:
    - Read, Edit y Write sobre ellos;
    - Grep, por ruta o por un glob que los incluya (el glob se salta `.gitignore`);
    - en shell, cualquier mención salvo en `ls`, `stat`, `test`, `echo` y parecidos;
    - `grep -r`, `rg -u`, `diff -r` y `find -exec` o `| xargs` sobre carpetas que los contienen (respeta `--include` y `--exclude`);
    - `printenv`, `env`, `export -p`, `set`, `gci env:` y `$VARIABLE` con nombre de secreto;
    - `docker compose config`, `docker inspect` y `docker compose exec … env`, porque `docker-compose.yml` carga `env_file: .env`.

    `node --env-file` con un secreto solo ejecuta scripts de `server/dist/`, sin `-e`, `-p` ni `-i` y sin leer de stdin; con `.env.online`, además, pregunta. Arnés de 148 casos fuera del repositorio (94 bloquean, 2 preguntan y 52 pasan; el más lento, 30 ms), en verde antes de activarlo. Una sonda en vivo (`cat --help .env`) se bloqueó. `npm run test:api` 310/310, typecheck y 184 tests unitarios en verde. No ve los scripts guardados en archivo ni `cat $(echo .env)`. Pendiente para A9: casos 4, 10 y 11, y en Windows.
- [x] **A7 · Hook `verificar-al-terminar`** (H4) · **IA**. En *Stop*:
  - **primero, los tests protegidos:** si `git status --porcelain -- server/src/tests/` muestra un archivo modificado, borrado o renombrado (no los nuevos, `??`) que no está en `.claude/permiso-tests.txt`, impide cerrar y dice qué archivo es. Esto también salta si el desarrollador edita un test a mano sin listarlo: es intencionado;
  - si `git status --porcelain` muestra cambios en `server/` o `client/`, ejecuta `npm test`;
  - con fallos, impide cerrar y devuelve el resumen del error;
  - **antes de activarlo,** comprobar que `npm test` está en verde y medir cuánto tarda. Si pasa de unos 20 segundos, el hook guarda una huella de los cambios (hash de `git status --porcelain` y `git diff`) en la carpeta temporal del sistema, fuera del proyecto, y no repite los tests si nada ha cambiado desde la última vez en verde;
  - respeta `stop_hook_active`, para no entrar en bucle;
  - no ejecuta `test:api`, porque necesita Postgres.
  - 2026-11-14 · `.claude/hooks/verificar-al-terminar.mjs` y `hooks.Stop` en `.claude/settings.json` (sin matcher, `timeout: 300`). No usa `shell.mjs`.
    - **Tests protegidos:** se comprueban con `git diff --name-status --no-renames HEAD -- server/src/tests/` en lugar de `git status --porcelain`, por la decisión de A5 («existente» = en HEAD). Así los tests nuevos ya añadidos al índice (`A`) no cuentan, y un renombrado aparece como borrado del original.
    - **Respuesta:** JSON con `decision: "block"` y `reason` para Claude, más `systemMessage` para el desarrollador. Con `stop_hook_active` no vuelve a bloquear: repite las comprobaciones y, si algo sigue mal, solo avisa con `systemMessage` (además, Claude Code corta solo tras 8 continuaciones).
    - **Si el hook falla:** en *Stop*, `onFailure` no tiene efecto, así que lo avisa con `systemMessage`.
    - **Sin caché de huellas:** `npm test` tarda unos 0,9 s (medido con `npm test` en verde, 184 tests).
    - **Pruebas:** arnés de 25 comprobaciones fuera del repositorio, con salidas de git simuladas, una muestra real de fallo de `node --test`, errores de `tsc` y el caso sin repositorio. Antes de activarlo, prueba real con un test nuevo temporal que fallaba: bloqueó con el resumen y, con `stop_hook_active`, solo avisó; después se borraron el test y sus compilados. Typecheck y 184 tests en verde.
    - **Pendiente para A9:** casos 7 y 8 en una sesión nueva, y en Windows.
- [x] **A8 · Hook `inicio-sesion`** (H6) · **IA**. En *SessionStart*: muestra la línea «Bloque actual» de `CLAUDE.md`, `git status --short` y una línea con la regla de los tests. Si `.claude/permiso-tests.txt` existe y tiene entradas, avisa de que hay una excepción abierta (solo lee el archivo, no lo toca).
  - 2026-11-14 · `.claude/hooks/inicio-sesion.mjs` y `hooks.SessionStart` en `.claude/settings.json`: sin matcher, así que actúa al arrancar, al reanudar, con `/clear`, al compactar y al bifurcar; `timeout: 15`.
    - **Qué muestra:** el mismo texto va al desarrollador (`systemMessage`) y al contexto de Claude (`additionalContext`). La línea «Bloque actual» sale sin la instrucción final de actualizarla. `git status` va con `--branch`, para ver que la rama es `develop` (condición de la sección 12), y como mucho 25 líneas.
    - **Si algo falla:** *SessionStart* no puede bloquear, así que lo dice en el propio mensaje (sin git o sin `CLAUDE.md`).
    - **Pruebas:** arnés de 10 comprobaciones fuera del repositorio. El aviso de la excepción se prueba con texto de ejemplo, sin crear ningún `permiso-tests.txt`. El hook tarda unos 26 ms. Se verá de verdad al reiniciar la sesión (A9).
- [x] **A8b · Hook de compilación tras editar** (sección 5, opcional) · **IA + D**. En *PostToolUse*, `npm run typecheck` tras editar un `.ts`. Se aplica solo si no ralentiza demasiado.
  - 2026-11-14 · Descartada por el desarrollador: el hook *Stop* de A7 ya ejecuta `npm test`, que empieza con `tsc -b`, así que un error de tipos ya impide cerrar sin añadir ~1 s a cada edición.
- [x] **A9 · Prueba de los candados** (H2, H3) · **IA + D**. El desarrollador reinicia la sesión y la IA intenta:
  1. editar un test existente → bloqueado;
  2. crear un test nuevo → permitido;
  3. con el archivo listado por el desarrollador en `permiso-tests.txt` → permitido;
  4. leer `.env` → bloqueado;
  5. `git commit` → bloqueado;
  6. `npm run seed:online` → pregunta;
  7. terminar con un test unitario roto a propósito en un archivo nuevo de prueba → no deja cerrar (después se borra ese archivo y sus compilados `.js` y `.d.ts` de `server/dist/tests/unit/`: `tsc -b` no los borra y `npm test` los seguiría ejecutando);
  8. el desarrollador cambia a mano una línea de un test existente, sin listarlo → al terminar, no deja cerrar (después lo restaura él);
  9. `git stash` y `git restore` → bloqueados;
  10. el agente `auditor`, con Bash, intenta `sed -i` sobre un test existente y `cat .env` → bloqueados;
  11. `node --env-file=.env.online server/dist/scripts/seed.js` escrito directamente, sin `npm run` → pregunta, y el desarrollador responde que no (A6).
  - **Hecho cuando:** los 11 casos dan lo esperado y quedan anotados en la bitácora.
  - 2026-11-14 · En Linux, los 11 casos dan lo esperado, en una sesión nueva (el resumen de `inicio-sesion` salió al arrancar) y en modo normal:
    - **Bloqueados:**
      - el 1, por `proteger-tests`;
      - el 4, por el permiso en Read y por `proteger-secretos` en `cat`;
      - el 5 y el 9, por los permisos;
      - el 10: los dos hooks paran también al `auditor`.
    - **Permitidos:** el 2 y el 3. En el 3, el *Stop* no cuenta el archivo listado.
    - **Preguntan:**
      - el 6, por la regla ask;
      - el 11: el hook devuelve `ask`, comprobado también pasándole la misma entrada.
    - **No dejan cerrar:** el 7, con el resumen del fallo, y el 8, que nombra el archivo.
    - **Pendiente de A4, cerrado:** `npm test` y `git status` pasan sin preguntar.
    - **Incidencias:**
      - en el caso 6 se respondió primero que sí, por error: el seed corrió contra Neon sin cambiar nada (es idempotente y marca `created` a cero);
      - en modo auto, el clasificador denegó lanzar el `auditor` del caso 10, así que se repitió en modo normal.
    - **Pendiente para el final:** Windows, cuando `develop` llegue al portátil (nada se sube antes).
    - **Hecho, 2026-11-16 (lo comprobó el desarrollador):** en Windows, los hooks bloquean lo esperado.
- [x] **A10 · Entrada de bitácora del paso A** (H1–H4) · **IA**. Con la plantilla de `docs/bitacora.md`, el resultado de A9 y los comandos git.
  - 2026-11-14 · Entrada «Limpieza del harness, paso A», al final de `docs/bitacora.md`: los cinco campos de la plantilla, más «Comprobación» y «Pendiente», como las entradas recientes (qué plantilla sigue la skill se decide en B1). Recoge el incidente del caso 6 y lo pendiente de Windows.

### Paso B · Skills, agentes, CI y orden (antes del 20-nov)

- [x] **B1 · Skills** (H8) · **IA**. Crear `cerrar-bloque`, `bitacora`, `encargo-codex` y `entregar-commit` en `.claude/skills/<nombre>/SKILL.md`. Cada una enlaza a la sección de `CLAUDE.md` o de `docs/` que aplica, en lugar de copiar reglas. `cerrar-bloque` incluye `/simplify` y `/code-review` (H9).
  - No se crea `nueva-funcionalidad` (DL10): ese flujo es el «Modo tarea» de `constructor`, que se mejora en B4.
  - `encargo-codex` parte de los tres encargos reales de `.claude/encargos/` (la misma estructura de seis apartados) y añade cuatro cosas: la regla de los tests y la de los secretos; que todo cambio en un test existente se entrega con la comprobación antes y después, para que el desarrollador lo autorice; que `.claude/` ya está en git (los encargos antiguos dicen lo contrario); y que el worktree no se borra hasta que su diff esté en `main` (bitácora, 2026-11-09: hubo que recuperar el trabajo de la sesión de Codex).
  - `bitacora`: la plantilla del principio de `docs/bitacora.md` (cinco campos, unas 10 líneas) no es la que usan las entradas reales (Pedido, Resultado, Tests, Comprobación y Limitaciones, y bastante más largas). Preguntar al desarrollador cuál de las dos sigue la skill.
  - **Hecho cuando:** tras reiniciar, cada skill aparece, y una ejecución de prueba de `bitacora` y de `entregar-commit` da el formato correcto.
  - 2026-11-14 · Cuatro skills en `.claude/skills/`, con la sintaxis de code.claude.com/docs/en/skills. Enlazan a secciones de `CLAUDE.md` y `docs/`, sin copiar reglas.
    - **Quién las lanza:** `cerrar-bloque` y `encargo-codex`, solo el usuario (`disable-model-invocation`, como `constructor`). `bitacora` y `entregar-commit` también las puede usar Claude al cerrar una tarea.
    - **`cerrar-bloque`:**
      1. alcance;
      2. typecheck, unitarios y API;
      3. `/code-review` (`high`) y `/simplify`, cuyos hallazgos se proponen antes de aplicarse;
      4. `frontend` y después `auditor`;
      5. tabla de la definición de terminado (✓, ✗ o manual);
      6. «Bloque actual» con el formato que lee `inicio-sesion`, árbol, comandos y bitácora;
      7. commits.
    - **`encargo-codex`:** los apartados 0–6 de los encargos reales, más cuatro reglas:
      - la de los tests y la de los secretos;
      - todo cambio en un test existente se entrega con la aserción antes y después, para el permiso;
      - `.claude/` ya está en git;
      - el worktree no se borra hasta que su trabajo esté en un commit de la rama de trabajo (bitácora, 2026-11-09).

      Dice también que la maqueta la copia el usuario al worktree, porque git la ignora.
    - **`bitacora`:** formato de las entradas reales (decisión del desarrollador, tras contar los campos de 90 entradas: Pedido 71, Resultado 70, Comprobación 68, Tests 37, Pendiente 30…). Por eso se reescribió el bloque «Plantilla» de `docs/bitacora.md`; el desarrollador autorizó salirse de «solo entradas nuevas». Con el argumento `prueba`, solo muestra la entrada.
    - **`entregar-commit`:** rutas explícitas, sin secretos ni tests existentes; el diff revisado con la lista de `CLAUDE.md`; `tipo(módulo): … (RN-xx | tarea X)`, sin firma.
    - **`CLAUDE.md`:** en «Quién hace qué», la fila de skills nombra las cinco (siguen siendo 158 líneas).
    - **Sin reiniciar:** según la documentación, una skill nueva en una carpeta de skills que ya existía se carga en la misma sesión. `bitacora` y `entregar-commit` aparecieron al momento. Las dos prueban el formato aquí: `bitacora prueba` mostró la entrada y `entregar-commit` dio los comandos de B1.
    - **Pendiente (desarrollador):** ver `/cerrar-bloque` y `/encargo-codex` en el menú `/` (Claude no las ve porque son solo del usuario).
    - **Hecho, 2026-11-16 (lo comprobó el desarrollador):** las skills salen en el menú `/`.
    - **Comprobación:** 188 tests unitarios en verde.
- [x] **B2 · Skills opcionales** (H8) · **IA + D**. `actividad-simulada` y `reemplazar-capitulos`, con los pasos de «Pulido» de `plan_mvp.md`. Solo describen los pasos: no ejecutan nada `:online`.
  - 2026-11-14 · Aprobada por el desarrollador. `.claude/skills/reemplazar-capitulos/SKILL.md` y `.claude/skills/actividad-simulada/SKILL.md`, de 40 líneas cada una.
    - **Cómo son:** solo las lanza el usuario (`disable-model-invocation`, como `cerrar-bloque`). Enlazan a «Pulido» (y la de reemplazo, al README) sin copiar los pasos. Claude solo lee y comprueba; lo que escribe en una base de datos, local u online, y `psql` los ejecuta el usuario.
    - **`reemplazar-capitulos`:**
      1. alcance, con lo que deja de verse;
      2. comprobaciones de `content/<slug>/` (`ffprobe`), `comic.json`, typecheck y tests;
      3. local;
      4. online, con la consulta previa del plan y la primera línea Neon/`r2`;
      5. bitácora.
    - **`actividad-simulada`:** el paso 0 comprueba que existe, porque **aún no está construida** (ni `demo-activity*.ts` ni los scripts). Si falta, remite a `/constructor` con los tests de la guarda primero. Después: comprobaciones de la guarda y de las altas (RN-13), pasada local u online (`--confirm <host>` lo escribe el usuario), comprobación en `/admin` y retirada (D21). Termina recordando que en la presentación se declara simulada (C3).
    - **`CLAUDE.md`:** la fila «Skills» de «Quién hace qué» nombra las dos (sigue en 158 líneas).
    - **Comprobación:** typecheck y 188 tests unitarios en verde. Cabecera YAML revisada a mano: la validación con `python3 -c` la bloqueó `proteger-secretos` por un error interno (ver «Fallos del analizador», tras B6).
    - **Pendiente (desarrollador):** ver `/reemplazar-capitulos` y `/actividad-simulada` en el menú `/`.
    - **Hecho, 2026-11-16 (lo comprobó el desarrollador):** las skills salen en el menú `/`.
- [x] **B3 · `auditor` ampliado** (H2, H4) · **IA**. Ampliar el apartado «F · Tests» que ya tiene `.claude/agents/auditor.md`. En el rango auditado, lista:
  - cada `assert` eliminado o cambiado en tests existentes;
  - cada `feat`/`fix` sin test nuevo;
  - cada test nuevo que pasaría también con el código anterior.
  - 2026-11-14 · Un punto nuevo en «F · Tests» (los dos que había no cambian) y una línea «Tests (F)» en el informe; cinco líneas más, nada quitado.
    - **Rango:** `<base>` es el commit de partida de la invocación (con «bloque N», el cierre del anterior) o `HEAD`; `git diff <base>` llega al árbol de trabajo. Se anota con los dos hashes (bitácora, 2026-11-02).
    - **Severidad (decisión del desarrollador):** test existente cambiado sin la excepción anotada en la bitácora, alta; `feat`/`fix` sin test nuevo, media; test que pasaría con el código anterior, media.
    - **Sin salirse de los límites del agente:** solo `git diff` y `git log`. La tercera lista es un juicio por lectura (no puede crear archivos ni cambiar de commit), solo para tests de `feat`/`fix`; los de un commit `test` fijan lo que ya existe.
    - **Comprobación:** los comandos, sobre `488a5c4..d62ba1d`, sacan el caso de H2 (tres `assert` cambiados en `import-content.test.ts` por `chaptersReplaced`) y el `feat` con sus archivos. Typecheck y 188 tests unitarios en verde.
    - **Pendiente (desarrollador):** en la sesión siguiente, lanzar `auditor` con un rango corto para ver la línea «Tests (F)» (un agente cambiado se carga al reiniciar).
    - **Hecho, 2026-11-14 (lo lanzó la IA a petición del desarrollador):** el `auditor`, sobre `488a5c4..8396178`, en la misma sesión, ya usó la versión nueva: un agente **cambiado** se carga sin reiniciar. Veredicto: APTO CON OBSERVACIONES, con un hallazgo alto.
      - **El hallazgo:** los tres `assert` de `import-content.test.ts` cambiados en `d62ba1d` (10-nov). La bitácora dice qué cambia y por qué, pero no el permiso; el commit es anterior a la regla (`330cd19`, 14-nov). Lo decide el desarrollador (B16).
      - **Las listas:** `feat`/`fix` sin test, ninguno; tests que pasarían con el código anterior, ninguno, juzgado por lectura.
      - **Lo que no pudo comprobar:** `test:api`, porque Postgres estaba parado.
      - **Falsos positivos:** el escaneo de secretos marca las cuatro `SEED_*_PASSWORD` inventadas de `.github/workflows/tests.yml`. Además, `proteger-secretos` le bloqueó un comando que nombraba `.env.test`; `cat .env.test` solo pasa, así que el bloqueo vino de otra parte de ese comando. Queda como dato para C1.
- [x] **B4 · Agentes y skill `constructor` revisados** (secciones 5 y 12) · **IA**. Hay que mostrar el diff de cada archivo antes y después.
  - `auditor` y `frontend` conservan `tools: Read, Grep, Glob, Bash` (ver sección 5).
  - Poner al día lo desfasado con el bloque 5: `frontend` (punto 6) trata Open Graph como fase 2–3 y `auditor` (punto A) cita Discord, y los dos entraron en «Fase 2 · bloque 5» de `plan_mvp.md` (de Discord, solo el enlace). Los reportes están descartados, no aplazados.
  - `frontend`: la ruta de la maqueta es `.claude/maqueta/` desde 0.5 (DL12); comprobar que el agente la encuentra en los dos ordenadores.
  - `constructor`, «Modo tarea» (DL10): el test se escribe y se ve fallar antes del código (hoy va después del servicio), y se añade la regla de los tests existentes con su excepción. La regla de git se enlaza en lugar de copiarse. El «Modo andamiaje» ya no se usa: preguntar si se archiva.
  - Sin reglas copiadas de `CLAUDE.md`, sin restos y sin datos sensibles.
  - 2026-11-14 · Diff de los tres archivos enseñado antes de los comandos. `tools` sin cambios.
    - **Alcance (decisión del desarrollador):** las listas de `auditor` y `frontend` siguen siendo comprobaciones con su comando. Se arregla lo desfasado y se cambian por una referencia los valores sueltos que pueden cambiar; no se reescriben como referencias.
    - **`auditor`:** el punto A excluye «Fase 2 · bloque 5» y lo descartado (reportes); cita el webhook de Discord, no el enlace; `engines.node` remite a `CLAUDE.md` («Proyecto»); el `.gitignore` incluye también `.env.online`. Sale el andamiaje de la descripción y del alcance.
    - **`frontend`:** en el punto 6 salen Open Graph y los reportes de la lista de fases 2–3, se exceptúa el bloque 5 y los reportes pasan a «descartados»; la severidad bloqueante remite al punto 6; la maqueta del navegador es `.claude/maqueta/<página>/index.html`. En este ordenador existen las 26 rutas de su tabla.
    - **`constructor`:** el «Modo andamiaje» se borra (decisión del desarrollador; queda en el historial, `a870a0a`), con su paso 0.1, su descripción y su `argument-hint`. Git y tests son enlaces a «Convenciones» y «Tests» (la regla de git estaba copiada al pie de la letra). El «Modo tarea» tiene un paso nuevo, «Test primero»: archivos nuevos, ver el fallo en la ejecución y no en la compilación, y guardarlo para la bitácora. Construir va después, hasta que pasen. Además: contrato no escrito = «pídelo» con borrador (concilia `CLAUDE.md` con la skill); entrega con `entregar-commit` y `bitacora`, y `/cerrar-bloque` al cerrar un bloque. De 118 a 40 líneas.
    - **Reglas antes y después:** en `constructor` no se pierde ninguna fuera del andamiaje. Se quedan las 5 reglas propias y los pasos de Localizar, Planificar, Construir, Verificar, Autorrevisar y Entregar. Git y tests apuntan a `CLAUDE.md`; el commit y la bitácora, a sus skills; «ejecutar el `auditor`», a `/cerrar-bloque` (paso 4). En los agentes no sale ninguna comprobación.
    - **Candados:** los ocho comandos escritos en los agentes pasan `proteger-tests` y `proteger-secretos` (probado con su entrada JSON; la sonda de control `cat .env` y `sed -i` sobre un test sí se bloquea).
    - **Comprobación:** typecheck y 188 tests unitarios en verde; sin rutas locales ni datos sensibles.
    - **Pendiente (desarrollador):** copiar `.claude/maqueta/` en el otro ordenador (0.5) y, en la sesión siguiente, ver `/constructor` con su nueva descripción en el menú `/`.
    - **Hecho, 2026-11-14:**
      - **Maqueta:** el desarrollador la da por hecha. Se lleva una copia de `.claude/maqueta/` (1,9 MB) con un `cp -a` hacia la carpeta de su terminal: le sirve de respaldo y de origen para el `.claude/maqueta/` del otro ordenador.
      - **`/constructor`:** la cabecera YAML de la skill y de los dos agentes se lee bien (PyYAML). El menú `/` no lo ve la IA, porque la skill es solo del usuario.
      - **Menú `/`, 2026-11-16 (lo comprobó el desarrollador):** las skills salen, `/constructor` incluida.
- [x] **B5 · Encargos de Codex** (sección 5) · **IA + DL3**. Pasar los de `.git/codex-t13/` a `.claude/encargos/`, si se decide versionarlos. Mover también `.claude/t13-stripe-online.md` a `.claude/encargos/` (DL13), para que la raíz de `.claude/` solo tenga configuración.
  - 2026-11-14 · DL3 = sí, solo el encargo, no los registros (decisión del desarrollador).
    - **Qué hay en `.git/codex-t13/`:** nueve archivos, no siete (corrige la sección 12):
      - dos encargos: `encargo.md`, 115 líneas, y `encargo-3.md`, 47, la tercera vuelta, que remite al primero;
      - dos registros: `dev.log` y `run-2.log`, de 418 KB;
      - `archivos.txt`, `maqueta-antes.sha`, `portafolio-antes.txt`, `sprite.patch` y `ultimo-2.txt`.
    - **Datos privados:** los dos encargos, leídos enteros, no tienen claves, contraseñas, correos ni URLs de bases de datos. Sí tienen rutas locales absolutas con el nombre de usuario (el worktree `koma-t13`, la maqueta en `Descargas` y `.git/codex-t13/`), igual que `codex-estudio.md`, y se aceptan como históricas con el criterio de DL12. Los registros no se han revisado porque no se suben.
    - **Copiados sin cambios** (`cmp` idéntico): `.claude/encargos/codex-home.md` y `.claude/encargos/codex-home-vuelta-3.md`, con el patrón `codex-<página>.md` de los otros. Es el T13 del bloque 2, la home. Los originales y el resto se quedan en `.git/codex-t13/`, que nunca se sube; borrarlo es decisión del desarrollador.
    - **Movido:** `.claude/t13-stripe-online.md` → `.claude/encargos/`. Es otro T13, el del bloque 4 (comprobaciones de Stripe online). Ningún archivo vivo lo citaba; solo la bitácora, que es histórica. La raíz de `.claude/` queda con `agents/`, `encargos/`, `hooks/`, `skills/`, `settings.json` y lo ignorado (`settings.local.json`, `maqueta/`, `parches/`).
- [x] **B6 · Plugins declarados** (sección 5) · **IA + DL8**. Declarar en `.claude/settings.json` los plugins que espera el proyecto.
  - 2026-11-14 · DL8 = no (decisión del desarrollador): no se declara ningún plugin y `.claude/settings.json` no cambia. Se anota para C1.

**Fallos del analizador de los hooks** (14-nov, encontrados al revisar el informe del `auditor`; pendientes de decisión del desarrollador). No se han rodeado ni arreglado.
1. **Comodines dentro de comillas.** `proteger-secretos` (`mentions()`, líneas 164–182, con `resolveWord` y `expandGlob`) trata cada palabra como una ruta, y en las de forma `--opcion=ruta` toma además lo que sigue al último `=`. Pero no sabe qué iba entre comillas, porque `walkCommand` las quita. Por eso `sed 's/=.*//'` (de ahí sale `.*//`) y `grep '.*'` expanden `.*` contra el disco, casan con `.env` y `.env.online` y se bloquean. Bash no expande comodines entre comillas. Es el comando que se le bloqueó al `auditor`: `rg … .env.example | sed 's/=.*//' ; …; cat .env.test | sed …`. No lo disparó `.env.test`, que pasa solo, sino el primer `sed`.
2. **Error interno con rangos al revés.** `globToRegExp` (`shell.mjs`, 74–108) construye una clase `[…]` sin validarla. Un texto entre comillas como `["disable-model-invocation"]` (tiene `l-i`) lanza «Range out of order», y el hook bloquea por precaución. Le pasó a un `python3 -c` que validaba YAML y a una sonda con `'[l-i]'`.
- **Pruebas:** los arneses de A5 y A6 (120 y 148 casos) estaban en carpetas temporales de sesiones anteriores que ya no existen, así que no hay pruebas a las que añadir los casos.
- **Arreglado el 2026-11-15** (enfoque y diff aprobados por el desarrollador; sección 11):
  - **Test primero:** `server/src/tests/unit/hooks.test.ts`, archivo nuevo con 5 tests `Seguridad:`. Lanza `proteger-secretos.mjs` con la entrada JSON de Claude Code contra una carpeta temporal con secretos falsos (`CLAUDE_PROJECT_DIR` apunta a ella). Así las pruebas de los hooks quedan en el repositorio, en `npm test` y en la CI. Tres tests fijan lo que debe seguir bloqueando y dos cubren los fallos. Con los hooks de antes: 3/5, y los dos que fallan dan `exit 2` en lugar de 0.
  - **Arreglo:** `shell.mjs`, `lex` anota en `seg.literal` las palabras cuyos comodines van todos entre comillas o escapados, y `globToRegExp` toma como texto una clase `[…]` inválida. `proteger-secretos.mjs`, `mentions()` no expande esas palabras en bash, salvo si llevan `$`, en PowerShell o con programas que expanden comodines por su cuenta (`OWN_GLOBS`: `git`, `zip`, `7z`, `rsync`, `tar`, `scp`). `find`, `grep -r`, `rg`, `xargs` y las redirecciones no cambian. `proteger-tests` no se toca.
  - **Probado antes de aplicarlo,** en una copia en el scratchpad: el test, 5/5. Se compararon los hooks de antes y los arreglados con 62 comandos × 2 hooks (A9, los de los agentes, los de `proteger-tests` y variantes con comillas). Cambian 11 casos, todos de `proteger-secretos` y todos falsos positivos que dejan de bloquear. Siguen bloqueando, entre otros, `cat '.env'`, `cat .*`, `cat '.env'*`, `for f in '.*'; do cat $f; done`, `find -name`, `zip`, `tar`, `git diff --no-index`, `dd if=`, `curl -d @.env` y PowerShell.
  - **Comprobación:** los archivos aplicados son idénticos a la copia probada. Typecheck y 193 tests unitarios en verde (188 + 5). Las sondas dan 0 diferencias con la copia. En vivo, `sed 's/=.*//'` y `grep '[l-i]'` pasan y `cat --help .env` sigue bloqueado.
  - **Queda igual:** `Select-String -Pattern '.*'` en PowerShell sigue bloqueando, porque allí los comodines entre comillas sí se expanden. Tampoco cambia lo que el hook no ve (`cat $(echo .env)`, scripts en archivo). Pendiente para el final: probarlo en Windows.
- [x] **B7 · CI en GitHub Actions** (H5) · **IA + DL2**. `.github/workflows/tests.yml`:
  - Node 24 (24.2 o posterior, por `engines`) y servicio `postgres:18` (la versión que da `plan_mvp.md`; confirmarla en `docker-compose.yml`) con usuario `koma`, contraseña `koma` y BD `koma_test`;
  - `npm ci --include=dev`, `npm run typecheck`, `npm test` y `npm run test:api`;
  - crea un `.env` de CI con valores de prueba que no sean secretos (secretos de más de 32 caracteres inventados, `PAYMENTS_DRIVER=fake`, `STORAGE_DRIVER=local`…), sin tocar los scripts de `package.json`. Se parte de `.env.example`: `env.ts` exige todas sus variables no opcionales, y el seed de `reset-test-db` necesita las cuatro `SEED_*_PASSWORD` con 10 caracteres o más (RN-12).
  - Antes del primer push, `npm run typecheck` tiene que estar en verde en local (ver B11).
  - **Hecho cuando:** el primer push da verde en GitHub.
  - 2026-11-14 · DL2 = sí (decisión del desarrollador). `.github/workflows/tests.yml`:
    - **Cuándo y qué:** en cada push a cualquier rama y en cada pull request a `main`, con `permissions: contents: read` y 15 minutos como máximo. `actions/checkout@v7` (sin guardar credenciales) y `actions/setup-node@v7` (Node 24, caché de npm). Las versiones salen de las etiquetas de sus repositorios y las entradas, de su `action.yml`; las dos corren sobre `node24`.
    - **Postgres:** servicio `postgres:18` con `koma`/`koma` y `POSTGRES_DB: koma_test`, porque en el runner no hay `docker/initdb/`.
    - **Pasos:** `npm ci --include=dev`, crear el `.env` de CI, `npm run typecheck`, `npm test` y `npm run test:api`. El `.env` sale de un heredoc con las claves de `.env.example`: secretos inventados de más de 32 caracteres, `PAYMENTS_DRIVER=fake`, `STORAGE_DRIVER=local`, `DATABASE_URL` hacia `koma_test` y las cuatro `SEED_*_PASSWORD` de 10 caracteres o más. Los tests que necesitan otro valor (Stripe, CSRF o BD caída) lo ponen en su `process.env`. `package.json` no cambia.
    - **Ensayo en un clon limpio de `develop`** (`318f57a`, en el scratchpad, sin `.env`, `content/` ni `storage/`):
      - `npm ci --include=dev`, typecheck y 188 tests unitarios, en verde;
      - YAML válido;
      - `env.ts` acepta las 21 variables del heredoc;
      - `test:api`, 310/310. Las variables se pasaron por entorno con un lanzador fuera del repositorio, sin crear ningún `.env`.
    - **npm 11.19** no ejecuta los scripts de instalación sin aprobación (`allowScripts`). No afecta: `bcrypt` 6 carga sus binarios precompilados, comprobado en el clon.
    - **Falso positivo de `proteger-secretos`:** bloqueó un `python3` en línea que leía el workflow solo porque su texto decía «.env». No se rodeó. Queda como dato para C1.
    - **Pendiente para el final:** el verde en GitHub con el primer push. La CI no frena el despliegue de Render, salvo que se active en Render la opción de esperar a los checks (lo decide el desarrollador). El árbol de `CLAUDE.md` aún no nombra `.github/`: se puede añadir en B9.
    - **Hecho, 2026-11-16 (lo comprobó el desarrollador):** con el paso de `develop` a `main` (`228c885`, avance rápido), la CI salió en verde en GitHub y Render desplegó con la versión de Node correcta; la app abre y deja entrar. Render sigue desplegando aunque la CI falle (decisión del desarrollador), así que el comentario de `tests.yml` sigue siendo exacto.
- [x] **B8 · `CLAUDE.md` al día** (H6) · **IA**. Corregir el árbol (los archivos que faltan y los que sobran, según el estado real tras 0.1), añadir la fecha de congelación y `docs/comandos.md`, y poner una tabla de «quién hace qué» con agentes, skills y hooks. Sin perder reglas. `constructor` figura como skill, no como agente. Los archivos de la actividad simulada (`demo-activity*.ts` y `npm run demo:activity`) se quedan solo si ya existen: hoy `package.json` no tiene esos scripts, y el `auditor` exige que coincidan con la tabla de comandos (ver B10).
  - 2026-11-14 · Cambios:
    - **Salen** (no existen): `seeds/`, `demo-activity.ts`, `demo-activity-guard.ts`, `demo:activity` (y `:online`) y las cuentas `actividad1…6@demo.test`. Todo sigue en `plan_mvp.md` (líneas 374–375, 1371 y 1382), y «Bloque actual» sigue nombrando la actividad simulada.
    - **Entran:** `services/admin.ts`, `services/payments.ts`, `utils/admin.ts` y `docs/comandos.md`; la congelación (20-nov) y la entrega (25-nov), en «Proyecto», porque DL9 sigue abierta.
    - **Sección nueva «Quién hace qué»,** tras «Estructura»: agentes, skill `/constructor`, hooks y permisos. En el árbol, `.claude/` remite a ella. `plan_limpieza.md` no entra en el árbol porque es temporal.
    - **Sin pérdidas:** no se quita ninguna regla. La tabla de comandos coincide con los scripts de `package.json`.
    - **Líneas:** 158. Por decisión del desarrollador se pasa de 150 hasta B9, que deja la raíz en 150 o menos; si DL4 sale que no, se recorta entonces. «Guía para CLAUDE.md» no tiene «Quién hace qué» ni «Tests» (B9).
    - **Comprobación:** typecheck y 184 tests en verde; `inicio-sesion` sigue leyendo «Bloque actual».
- [x] **B9 · `CLAUDE.md` reorganizado** (H7) · **IA + DL4**. Raíz con lo común y 150 líneas como máximo; `client/CLAUDE.md` con las reglas del cliente; `server/CLAUDE.md` con las del servidor y las trampas. La «Definición de terminado» queda en una sola fuente. Además:
  - entregar la lista de reglas antes y después, que demuestre que no se pierde ninguna;
  - avisar de los 9 comentarios del código que citan secciones de `CLAUDE.md` (cambiarlos es código de la app: preguntar);
  - proponer el cambio de «Guía para CLAUDE.md» en `plan_mvp.md`.
  - 2026-11-15 · DL4 = sí, con condiciones (decisión del desarrollador, sección 9). La raíz pasa de 158 a 135 líneas; `client/CLAUDE.md` tiene 14 y `server/CLAUDE.md`, 36.
    - **Raíz:**
      - «Proyecto», con una línea nueva que dice qué hay en los `CLAUDE.md` de las carpetas;
      - «Comandos», «Tests», «Quién hace qué», «No haremos», «Seguridad obligatoria», «Cuándo leer `docs/`» y «Definición de terminado»;
      - «Estructura»: el árbol entero, con una línea nueva para los tres `CLAUDE.md`, y tres reglas de arquitectura comunes;
      - «Convenciones» comunes: idiomas, valores numéricos con zod como fuente de verdad, y git y commits;
      - «Trampas conocidas» comunes: ESM.
    - **`server/CLAUDE.md`:**
      - «Recorrido de una petición», con los drivers y `syncSubscription`;
      - «Convenciones» del servidor: BD, auditoría, errores, `requestId`, `ILIKE` y redirecciones;
      - «Trampas conocidas»: Express 5, zod 4, Stripe, R2, `trust proxy`, bcrypt, Neon y Render.
    - **`client/CLAUDE.md`:**
      - «Convenciones» del cliente: peticiones, `bindForm`, `store`, sesión, `localStorage`, HTML semántico, CSS y `#v-n`;
      - «Trampas conocidas»: sin bundler.
    - **Desvíos aprobados** (ante la duda, a la raíz):
      - «Convenciones» comunes en la raíz;
      - ESM en la raíz y «sin bundler» en el cliente;
      - tres reglas de arquitectura en «Estructura».
    - **Retoques aprobados:** «este archivo» pasa a «los `CLAUDE.md`» (líneas 77 y 78) y a «un `CLAUDE.md`» (línea 138).
    - **Sin pérdidas:** la tabla de 110 reglas se aprobó antes de editar. Sobre los archivos reales:
      - 118 líneas están idénticas en un solo archivo;
      - las 7 cambiadas (59, 77, 78, 95, 100, 103 y 138) tienen sus 17 fragmentos en su destino;
      - ninguna está duplicada: el separador `| --- | --- |` de las dos tablas de la raíz ya estaba dos veces.
    - **Referencias:**
      - Los hooks y `settings.json` solo citan «Tests» y «Bloque actual», que siguen en la raíz: no se tocan.
      - `auditor`, `frontend`, `constructor` y `encargo-codex` leen los tres `CLAUDE.md` (10 líneas, diff aprobado).
      - Los 9 comentarios del código se quedan como están (decisión del desarrollador): 6 citan secciones de la raíz y 3, la sección del mismo nombre en el `CLAUDE.md` de su carpeta. `layout.test.ts:136` es un test existente.
    - **`.dockerignore`:** se añade `**/CLAUDE.md` y no se quita ninguna línea.
    - **`plan_mvp.md`** (diff aprobado aparte):
      - «Guía para CLAUDE.md», con los tres archivos y el orden real de la raíz;
      - la definición de terminado, en una sola fuente, `CLAUDE.md`. La copia del plan difería en tres puntos y ninguno faltaba en `CLAUDE.md`. Se mantienen los dos títulos, que cita el índice;
      - las antiguas líneas 1362 (los encargos dejan fuera los tres `CLAUDE.md`) y 1542 (adónde van las trampas).
    - **Prueba de carga:** hecha en esta sesión, por decisión del desarrollador, y no en una nueva. Al leer `client/src/components/ad.ts` se cargó `client/CLAUDE.md`; al leer `server/src/config/limits.ts`, `server/CLAUDE.md`.
    - **Comprobación:**
      - typecheck y 193 tests unitarios en verde;
      - `claude-tree.test.ts`, en verde: ahora comprueba también los dos archivos nuevos;
      - `inicio-sesion` sigue leyendo «Bloque actual».
    - **Queda por decidir:**
      - En `plan_mvp.md`, la línea 47 («la fuente del CLAUDE.md») ya no es exacta para la definición de terminado.
      - En `plan_mvp.md`, la fila «CLAUDE.md» de «Decisiones» (≤ 150 líneas) es histórica y no se ha tocado.
      - La línea 5 de este plan da DL3 y DL8 como abiertas, pero se resolvieron el 14-nov.
      - La carga en subagentes no se ha probado: `auditor` y `frontend` leen los tres `CLAUDE.md` porque se lo dice su archivo.
        - **Probado, 2026-11-16 (a petición del desarrollador):** sí se cargan. Con la orden de no abrir ningún `CLAUDE.md`, el `auditor` leyó solo `client/src/components/ad.ts` y recibió `client/CLAUDE.md`, y el `frontend` leyó solo `server/src/utils/layout.ts` y recibió `server/CLAUDE.md`; los dos, también el de la raíz al arrancar. El título y los encabezados `##` que copiaron coinciden con los archivos reales.
- [x] **B10 · Test del árbol de `CLAUDE.md`** (H6) · **IA + DL7**. Archivo **nuevo** en `server/src/tests/unit/` que comprueba que cada ruta del árbol de `CLAUDE.md` existe.
  - **Hecho cuando:** falla si se nombra un archivo inexistente y pasa con el árbol corregido de B8.
  - **Cuidado:** `CLAUDE.md` documenta por adelantado lo ya aprobado (hoy, la actividad simulada). El test tiene que convivir con eso: o el árbol solo nombra lo que existe, o el test admite una lista corta y explícita de «pendientes». Preguntar cuál.
  - 2026-11-14 · `server/src/tests/unit/claude-tree.test.ts`, con cuatro tests `Seguridad:`.
    - **Decisiones del desarrollador:** DL7 = `Seguridad:`, como ya hacen `no-any` y los de `theme-color` y tema oscuro. El árbol solo nombra lo que existe: lo aprobado y aún sin construir entra con sus archivos, sin lista de pendientes.
    - **Analizador,** sin dependencias y dentro del propio test. Lee el bloque de «## Estructura» y comprueba:
      - carpetas y archivos con extensión;
      - lo listado entre paréntesis tras una carpeta;
      - las listas de nombres (`auth, users…`), que valen como carpeta o como archivo con cualquier extensión.

      No comprueba los marcadores (`<página>.html`), lo que sigue a `→` ni lo que ignora `.gitignore` (`content/` y `storage/`).
    - **Qué cubre:** del árbol real saca 120 rutas, todas versionadas, así que también pasará en un clon limpio (B7). Comprueba que lo nombrado existe, no que esté todo nombrado.
    - **Visto fallar:** con el `CLAUDE.md` de antes de B8 (`0b05786`, puesto un momento y devuelto sin diff) falla y nombra `seeds/`, `demo-activity.ts` y `demo-activity-guard.ts`. Los otros tres tests cubren la muestra del analizador, la detección en una carpeta temporal y el fallo si no hay árbol.
    - **Comprobación:** typecheck y 188 tests unitarios en verde.
    - **Aviso para B9:** el test busca el árbol en `CLAUDE.md`, bajo «## Estructura». Si B9 lo mueve o lo parte entre `client/` y `server/`, hay que cambiar un test que ya será existente, con el procedimiento de excepción.
- [x] **B11 · Avisos de TypeScript** (H9) · **IA + DL6**. Añadir los cuatro avisos de H9 a `server/tsconfig.json` y `client/tsconfig.json`. El proyecto usa TypeScript 7.0.2: comprobar en su documentación que las cuatro opciones siguen llamándose así. Si aparecen errores, **no arreglarlos**: entregar la lista (archivo, línea, aviso), **quitar de nuevo los avisos** para no dejar el typecheck ni la CI en rojo, y esperar la decisión.
  - 2026-11-14 · Las cuatro opciones mantienen el nombre en TypeScript 7.0.2: comprobado en la ayuda del compilador instalado (`tsc --help --all`).
    - **Primera pasada:** un solo error, en el servidor, y ninguno en el cliente: `server/src/scripts/demo-data.ts(148,6): TS6196 'AuthorChapter' is declared but never used` (`noUnusedLocals`), un alias de tipo sin usar desde `61026aa`. Se quitaron los avisos y se esperó la decisión.
    - **DL6, decisión del desarrollador:** activar los cuatro y borrar esa línea. Es código de la app, pero no cambia nada al ejecutar, porque un tipo no llega al JS. El aviso del compilador hace de test: con los avisos y la línea, el typecheck falla (se vio); sin la línea, pasa.
    - **Comprobación:** typecheck y 188 tests unitarios en verde. No hace falta `test:api`, porque el cambio no llega al JS.
- [x] **B12 · Índices** (H10) · **IA**. Un índice al principio de `docs/plan_mvp.md` y de `docs/bitacora.md`, sin cambiar el resto del contenido.
  - 2026-11-15 · Un «## Índice» en cada uno, justo antes de su primera sección. Solo se añaden líneas (30 y 14) y no se quita ni se cambia ninguna.
    - **`plan_mvp.md`:** las 25 secciones `##` con su enlace y, tras los dos puntos, sus subsecciones `###` como texto, separadas por «;» porque algunos títulos ya llevan «·» o comas. Una línea dice cómo leer un tramo (`grep -n '^##'`).
    - **`bitacora.md`:** por bloques (decisión del desarrollador, frente a las 90 entradas una a una). Una tabla de 7 filas (bloque 0 a 5 y Pulido) con las fechas y los enlaces a la primera entrada y a la de cierre: 165, 458 (T18), 758 (T12), 996 (T15) y 1217. Las entradas siguen en orden y forman 7 grupos seguidos. La fila nueva se añade al empezar un bloque. Desde el 15-nov lo hace `/cerrar-bloque`, en el paso 6 (con permiso del desarrollador): completa la fila del bloque que cierra y abre la del siguiente.
    - **Anclajes:** calculados con el algoritmo de GitHub (sin la puntuación, cada espacio por «-» y los repetidos con `-1`) y comprobados sobre los archivos ya cambiados: 37 enlaces, ninguno roto. Ningún código ni test lee el contenido de estos dos documentos, y las skills buscan las entradas con `grep -n '^### '`, que el índice no altera.
    - **Comprobación:** typecheck y 193 tests unitarios en verde.
    - **Pendiente para el final:** abrir los enlaces en GitHub tras el primer push.
- [ ] **B13 · Contratos archivados** (H10) · **IA + DL5**. Mover los contratos de los bloques 1 a 4 a `docs/contratos_cerrados.md` y actualizar las referencias de `CLAUDE.md`. Antes de mover nada, buscar las referencias a esas secciones en `server/src`, `client/src`, `.claude/` y `docs/` y entregar la lista: las que estén en código de la app se preguntan.
  - 2026-11-15 · DL5 = después de la congelación (decisión del desarrollador). Aplazada: sigue sin marcar y la entrada de B16 la deja como pendiente.
- [x] **B14 · Cobertura** (H11) · **IA**. Script `test:coverage` en `package.json` (solo en `scripts`) con la medición de cobertura de `node --test`, sin dependencias. Comprobar en la documentación de Node 24 el nombre exacto de la opción. Los tests unitarios solos darán un porcentaje bajo, porque casi todo el código lo cubren los de API: para C2, medir también `test:api` (con Postgres) y decir qué cifra es cuál. Si escribe a disco, añadir `coverage/` al `.gitignore`.
  - El `auditor` comprueba que los scripts de `package.json` son los de la tabla de comandos de `CLAUDE.md`: el script nuevo se añade a esa tabla dentro de una fila existente (no quedan líneas libres) y al README.
  - **Hecho cuando:** se obtiene el porcentaje.
  - 2026-11-15 · Dos scripts, `test:coverage` (unitarios) y `test:api:coverage` (API), con `--experimental-test-coverage`, `--test-coverage-include="server/dist/**"` y `--test-coverage-exclude="server/dist/tests/**"`.
    - **Opción:** en Node 24.22.2 sigue siendo `--experimental-test-coverage`, comprobado en la ayuda del Node instalado (`node --help`), como en B11.
    - **Por qué dos scripts (decisión del desarrollador):** la API no se puede medir con `npm run test:api`. Node rechaza la opción en `NODE_OPTIONS` y la ignora si va detrás del glob (`npm run test:api -- …`). Con un script propio, `koma_test` se sigue tocando solo con `npm run` y C2 se puede repetir. `test:api:coverage` hace los mismos pasos que `test:api`.
    - **Disco:** no escribe nada (la tabla sale por la consola), así que el `.gitignore` no cambia.
    - **Tablas:** en `CLAUDE.md`, dentro de las filas de `npm test` y `test:api` (sigue en 158 líneas); en el README, una fila nueva. `docs/comandos.md` no se toca porque el plan no lo incluye; se puede añadir en C1.
    - **Cifras** (líneas del JS compilado de `server/dist`, sin `tests/`: 87 archivos y 6.751 líneas). Node solo cuenta los archivos que carga algún test, así que se dan dos cifras (decisión del desarrollador):

      | Tests | Cifra de Node (líneas · ramas · funciones) | Archivos que cuenta | Líneas sobre todo el servidor |
      | --- | --- | --- | --- |
      | Unitarios (`test:coverage`, 193 en verde) | 70,90 % · 95,71 % · 71,29 % | 36 de 87 | 26,35 % |
      | API (`test:api:coverage`, 310 en verde) | 96,76 % · 91,79 % · 95,93 % | 81 de 87 | 86,31 % |

      La última columna cuenta como 0 % los archivos que no se cargan. Se calculó una vez, con un script temporal fuera del proyecto, y en los unitarios se comprobó con el informe lcov (1.779 de 2.509 líneas). La API no carga seis archivos: `server.js`, `migrate.js` y `reset-test-db.js` (corren fuera de los tests) y los tres `demo-*.js` (los cargan los unitarios). Las dos filas no se suman, porque cubren en parte las mismas líneas. Para C2, la cifra útil es la de la API.
    - **Comprobación:** typecheck, `npm test` (193) y `npm run test:api` (310) en verde, con los dos scripts nuevos.
- [ ] **B15 · Recordatorio de la actividad simulada** (sección 7) · **D**. Cuando se construya (fuera de este plan), usar `/constructor`: primero los tests `Seguridad:` de la guarda.
- [x] **B16 · Entrada de bitácora del paso B** · **IA**.
  - **Debe recoger (decisión del desarrollador, 14-nov):** el desarrollador aprueba el cambio de los tres `assert` de `server/src/tests/api/import-content.test.ts` en `d62ba1d` (10-nov) como cambio de contrato anterior a la regla de «Tests» (`330cd19`, 14-nov). El test no se toca. Es el hallazgo alto del `auditor` de B3.
  - 2026-11-16 · Entrada «Limpieza del harness, paso B», al final de `docs/bitacora.md`, con la skill `bitacora`. Recoge esa aprobación en «Tests» (los tres `assert.deepEqual` añadieron `chaptersReplaced: 0`, el campo nuevo de `--replace`), las DL del paso, el arreglo de `proteger-secretos` y, como pendientes, B13 (DL5) y B15. El índice de la bitácora no cambia: la entrada cae en la fila «Pulido».
    - **Comprobación:** sobre `8733ef4`, typecheck, 193 unitarios y 310 de API en verde; `test:api:coverage` da el mismo 96,76 % de B14.
    - **Corregido:** la línea 5 de este plan daba DL3–DL5 y DL8 como abiertas; ahora solo queda DL9.
    - **Después, 2026-11-16 (propuesta aceptada por el desarrollador):** el punto 5 de «Cómo trabajar cada tarea» (sección 11) recoge el aprendizaje de la entrada: qué se carga sin reiniciar y cuándo pedir el reinicio.

### Paso C · Para la entrega (bloque 6, 20 – 25 nov)

- [x] **C1 · «Cómo trabajamos con IA»** (sección 2) · **IA**. `docs/harness.md`, o una sección del README:
  - un esquema del flujo (plan → contrato → test → constructor → `frontend`/`auditor` → bitácora → commit del desarrollador);
  - qué hace cada agente, skill, hook y permiso, y por qué;
  - cómo desactivar un hook en una emergencia;
  - ejemplos reales de la bitácora. Por ejemplo, el auditor detectó que `/files/%E0%A4%A` y `?q=%00` daban 500.
  - plugins: el proyecto no declara ninguno (DL8). Si un ordenador tiene plugins de usuario (el segundo tiene `superpowers`), Claude puede comportarse distinto en cada uno.
  - 2026-11-16 · `docs/harness.md` (decisión del desarrollador, frente a una sección del README), de 159 líneas y con seis apartados: flujo, piezas, emergencia, ejemplos, límites y plugins. Los datos se comprobaron en la sesión: `settings.json` (19 deny, 9 ask y 7 allow), la cabecera de cada hook y skill, y seis entradas de la bitácora leídas por tramos. Las reglas no se copian: se enlazan.
    - **Enlaces (decisión del desarrollador):** `harness.md` entra en la línea `docs/` del árbol de `CLAUDE.md` (sigue en 135 líneas) y el README gana una línea tras la presentación. Esa línea amplía lo que la sección 11 permite tocar en el README, con permiso.
    - **Emergencia, según la documentación oficial (16-nov):** `/hooks` es solo de lectura y no desactiva nada, aunque la sección 11 lo daba como ejemplo. Lo que vale es `claude --settings '{"disableAllHooks": true}'` para una sesión, `"disableAllHooks": true` en `.claude/settings.local.json` para el ordenador, o borrar la entrada de un hook en `settings.json`. Los permisos siguen activos.
    - **Ejemplo nuevo, de esta sesión:** `proteger-secretos` bloqueó un `wc -l docs/*.md` de la IA, porque el comodín incluía `credenciales.local.md`. Se repitió el comando sin el secreto.
    - **Sin tocar:** «Bloque actual» sigue en «Pulido» (decisión del desarrollador). La estructura de `docs/ideas_base.md` (línea 84) no nombra `harness.md`; no está en la lista de lo que se puede tocar.
    - **Comprobación:** typecheck y 193 tests unitarios en verde (`claude-tree.test.ts` comprueba la ruta nueva); los 11 enlaces relativos de `harness.md` existen. Pendiente para el final: los anclajes del índice en GitHub.
- [x] **C2 · Cifras para la presentación** (sección 2) · **IA**. Número de tests (unitarios y de API), cobertura (B14), auditorías pasadas y hallazgos corregidos (contados en la bitácora), commits y bloques cerrados.
  - 2026-11-16 · Sección «7. Cifras» de `docs/harness.md` (decisión del desarrollador). Todo se ha recontado en la sesión sobre `4ce0396`, sin copiar cifras del plan ni de la bitácora:
    - **Tests:** `npm run test:coverage` da 193 en verde, en 30 archivos, y `npm run test:api:coverage` (Postgres levantado por el desarrollador) da 310, en 39. Por nombre, 243 `RN-xx` y 260 `Seguridad:`, sin ninguno de otro tipo; las 21 RN del plan tienen al menos un test.
    - **Cobertura:** API 96,76 % · 91,79 % · 95,93 % en 81 de 87 archivos, y 86,31 % de las líneas de todo el servidor; unitarios 70,90 % en 36 archivos, y 26,35 %. Son las mismas cifras de B14, porque desde entonces no ha cambiado el código de la app. La cifra sobre todo el servidor se calculó con un script temporal fuera del proyecto, que comprobó que el porcentaje de cada archivo cuadra con su número de líneas.
    - **Revisiones (lectura de cada veredicto de la bitácora, por tramos):** 39 con veredicto, 17 del `auditor` y 22 del `frontend`: 11 APTO, 24 APTO CON OBSERVACIONES y 4 NO APTO. Hallazgos anotados: 218 (47 + 171), con una revisión del `auditor` sin cifra. Los «corregidos» no se pueden contar de forma fiable, porque la bitácora no separa siempre lo corregido de lo aceptado o aplazado, así que la cifra es de hallazgos anotados y el documento lo dice.
    - **Commits:** 178 en `develop` (141 en `main`), sin merges: 77 `docs`, 43 `feat`, 25 `fix`, 24 `chore`, 4 `test`, 1 `style`, 1 `refactor`, 1 `ci` y 2 sin prefijo.
    - **Bloques:** 1 a 5 cerrados, con su entrada de cierre, más el bloque 0 de planificación; el pulido sigue en curso. La bitácora tiene 91 entradas.
    - **Corrige la sección 1:** había 28 archivos de tests unitarios y ahora hay 30 (`claude-tree` y `hooks`, del paso B); los de API siguen siendo 39.
    - **Comprobación:** typecheck y los dos scripts de cobertura en verde.
- [ ] **C3 · Actividad simulada declarada** (sección 7) · **IA + D**. Una frase en el README y en el guion de la demo diciendo que la actividad de las cuentas `@demo.test` es simulada.
  - 2026-11-16 · Hecha la mitad del README; la del guion, pendiente (decisiones del desarrollador). Por eso sigue sin marcar.
    - **Comprobado antes de escribir:** la actividad simulada de la idea 24 no existe (ni `demo-activity*.ts` ni `demo:activity` en `package.json`; solo la skill y su apartado de `plan_mvp.md`). Tampoco hay guion de la demo: el calendario de `plan_mvp.md` lo pone en el bloque 6, y el apartado 9 de `docs/comandos.md` es una lista técnica del día de la presentación.
    - **README:** una frase general tras la línea de `docs/harness.md`. Dice que las cuentas `@demo.test` son de demostración y que sus lecturas, comentarios y estadísticas los generan scripts. Hoy cubre `demo:data`, solo en local, y valdrá para `demo:activity` cuando exista. No dice «por la API» porque `demo:data` escribe por SQL los lectores, sus lecturas y sus comentarios (la API no admite fechas pasadas).
    - **Pendiente (desarrollador):** la frase en el guion de la demo, cuando se escriba en el bloque 6. Al terminarlo, se marca esta tarea.
- [x] **C4 · Entrada de bitácora del paso C** · **IA**.
  - 2026-11-16 · Entrada «Limpieza del harness, paso C», al final de `docs/bitacora.md`, con la skill `bitacora`. Tramo `4f37c58..7b28895`, más C3 y C4. Recoge C1, C2 y C3 a medias, las decisiones del desarrollador, los dos bloqueos de `proteger-secretos` a la IA (no se rodearon) y la corrección sobre `/hooks`. Como pendientes: la frase del guion (C3), C5, B13, B15, Windows y los anclajes en GitHub. El índice de la bitácora no cambia: la entrada cae en la fila «Pulido».
    - **Comprobación:** typecheck y 193 tests unitarios en verde.
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
   - para hooks, permisos, agentes y skills, pruébalos en la misma sesión: los permisos y los hooks (A4–A6), una skill nueva en una carpeta de skills que ya existía (B1), un agente cambiado (B3) y el `CLAUDE.md` de una carpeta al leer uno de sus archivos (B9) se cargan sin reiniciar. Pide al desarrollador que reinicie la sesión solo para un agente nuevo, que no se ha probado (bitácora, 2026-11-02: no se cargaba hasta la sesión siguiente), o si lo nuevo no aparece.
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
- El contenido de `.git/codex-t13/` (DL3, B5): siete archivos, entre ellos dos registros (`dev.log` y `run-2.log`, de 418 KB) que hay que revisar por si tienen datos privados antes de decidir DL3. Corregido en B5 (14-nov): son nueve; solo se suben los dos encargos.
- Los encargos E2–E4, si ya están escritos fuera de `.claude/encargos/`.
