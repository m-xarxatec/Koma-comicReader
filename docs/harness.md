# Cómo trabajamos con IA · Koma

Koma se ha construido con Claude Code como asistente principal y con Codex para encargos de diseño. Este documento explica el *harness*: las reglas, los agentes, las skills, los hooks y los permisos que encauzan ese trabajo. Todo está versionado en `.claude/` y en los tres `CLAUDE.md`, así que cada cambio se ve como un diff. Las reglas no se copian aquí: cada apartado enlaza a su fuente.

## Índice

1. [El flujo de una tarea](#1-el-flujo-de-una-tarea)
2. [Las piezas](#2-las-piezas)
3. [Desactivar un hook en una emergencia](#3-desactivar-un-hook-en-una-emergencia)
4. [Ejemplos reales de la bitácora](#4-ejemplos-reales-de-la-bitácora)
5. [Límites conocidos](#5-límites-conocidos)
6. [Plugins](#6-plugins)
7. [Cifras](#7-cifras)

## 1. El flujo de una tarea

```
 plan_mvp.md ── regla (RN), caso de uso (CU) y fase
      │
      ▼
 contrato del bloque ── lo aprueba el desarrollador; sin contrato no se programa
      │
      ▼
 /constructor ── 1) test nuevo, visto fallar  2) código hasta que pasa  3) typecheck y tests
      │
      ▼
 frontend (páginas) → auditor (todo el diff) ── revisan sin poder modificar archivos
      │
      ▼
 skill bitacora → skill entregar-commit ── entrada de la bitácora y comandos git
      │
      ▼
 commit del desarrollador ── CI en GitHub Actions
```

Alrededor de todo el flujo están los candados: permisos y hooks que la herramienta aplica aunque la IA se equivoque.

- **Plan y contrato.** [`plan_mvp.md`](plan_mvp.md) fija el alcance, las reglas y el calendario, y cada bloque tiene un contrato de API aprobado antes de programar. Lo que no está especificado se pregunta ([`CLAUDE.md`](../CLAUDE.md), «Cuándo leer `docs/`»).
- **Test primero.** El test se escribe y se ve fallar al ejecutarse, no al compilar, antes de programar. Los tests existentes no se tocan ([`CLAUDE.md`](../CLAUDE.md), «Tests»).
- **Quien hace no es quien revisa.** Construye la sesión principal (o Codex) y revisan dos agentes que no pueden editar.
- **Git es del desarrollador.** La IA entrega los comandos `git add` y `git commit`, y él decide si se ejecutan. Un `git push origin main` despliega en Render.
- **Codex, para el diseño de páginas.** `/encargo-codex` redacta el encargo, con el alcance de archivos cerrado y la lista de lo que no puede tocar. Codex trabaja en un worktree aparte, el agente `frontend` revisa cada vuelta y la sesión principal trae el diff al árbol. Los encargos están en [`.claude/encargos/`](../.claude/encargos/).

## 2. Las piezas

### `CLAUDE.md`, en tres archivos

| Archivo | Qué tiene | Cuándo lo carga Claude |
| --- | --- | --- |
| [`CLAUDE.md`](../CLAUDE.md) | Lo común: proyecto, comandos, tests, estructura, quién hace qué, lo que no haremos, convenciones, seguridad y definición de terminado | En cada sesión |
| [`client/CLAUDE.md`](../client/CLAUDE.md) | HTML, CSS y TS del cliente | Al leer un archivo de `client/` |
| [`server/CLAUDE.md`](../server/CLAUDE.md) | Recorrido de una petición, convenciones y trampas del servidor | Al leer un archivo de `server/` |

Por qué: las reglas de CSS no ocupan contexto cuando se toca el servidor, ni al revés.

### Agentes ([`.claude/agents/`](../.claude/agents/))

| Agente | Qué revisa | Cuándo |
| --- | --- | --- |
| `frontend` | Cada página frente a los `CLAUDE.md`, `docs/` y la maqueta (`.claude/maqueta/`, fuera de git): tokens, CSP, HTML semántico, paridad de RN-12, fidelidad a la maqueta, fases y enlaces rotos | Al terminar una página y antes del `auditor` del cierre del bloque |
| `auditor` | El código frente a los `CLAUDE.md` y `docs/`: alcance por fase, seguridad, arquitectura, RN, trampas de versión y definición de terminado. En los tests, lista los `assert` cambiados, los `feat`/`fix` sin test nuevo y los tests que pasarían también con el código anterior | Antes de un commit relevante y al cerrar cada bloque |

Los dos tienen `Read`, `Grep`, `Glob` y `Bash`, pero no `Edit` ni `Write`. Bash les hace falta para `npm test` y `rg`, y los mismos hooks que a la sesión principal les impiden escribir en un test o leer un secreto: se probó con el `auditor`. Cada informe da un veredicto (por ejemplo, APTO CON OBSERVACIONES) y los hallazgos por severidad, y anota el rango auditado con sus dos commits.

Por qué: el que construye no se corrige a sí mismo, y un revisor que no puede editar no puede «arreglar» lo que debía señalar.

### Skills ([`.claude/skills/`](../.claude/skills/))

| Skill | Quién la lanza | Qué hace |
| --- | --- | --- |
| `/constructor` | El desarrollador | Construye una tarea o un bloque: localizar la RN y el contrato, planificar, test primero, construir, verificar, autorrevisar y entregar |
| `/cerrar-bloque` | El desarrollador | Recorre la definición de terminado: typecheck, unitarios y API, `/code-review` y `/simplify`, `frontend` y `auditor`, la línea «Bloque actual», el árbol de `CLAUDE.md` y la bitácora |
| `/encargo-codex` | El desarrollador | Redacta un encargo para Codex con el alcance cerrado, la regla de los tests y la de los secretos, y cómo integrarlo sin perder el worktree |
| `/reemplazar-capitulos` · `/actividad-simulada` | El desarrollador | Guían dos operaciones del pulido. Claude solo lee y comprueba; lo que escribe en una base de datos lo ejecuta el desarrollador |
| `/anadir-video <enlace>` | El desarrollador | Añade un vídeo a Tutoriales (CU-42): saca el título y la descripción de YouTube y lo escribe en `server/src/config/tutorials.ts` |
| `bitacora` | Claude, al cerrar una tarea, o el desarrollador | Escribe la entrada de [`bitacora.md`](bitacora.md) con su plantilla y solo con datos comprobados en la sesión |
| `entregar-commit` | Claude, al cerrar una tarea, o el desarrollador | Da los comandos `git add` y `git commit` con rutas explícitas y el formato `tipo(módulo): … (RN-xx)` |

Por qué: una skill se carga solo cuando hace falta, así que ahorra contexto, y se ejecuta siempre igual. Las que cierran un bloque, encargan trabajo o tocan una base de datos solo las lanza el desarrollador (`disable-model-invocation`).

### Hooks ([`.claude/hooks/`](../.claude/hooks/), activados en [`.claude/settings.json`](../.claude/settings.json))

Son scripts `.mjs` de Node, sin dependencias, para Linux y Windows.

| Hook | Momento | Qué hace | Si falla por dentro |
| --- | --- | --- | --- |
| `proteger-tests` | Antes de editar o de ejecutar (*PreToolUse*) | Bloquea modificar, mover o borrar un test de `server/src/tests/` que ya está en el último commit, con Edit/Write o con comandos de shell. Deja crear tests nuevos. Excepción: los archivos que el desarrollador lista en `.claude/permiso-tests.txt` | Bloquea |
| `proteger-secretos` | *PreToolUse* | Bloquea leer, copiar, mostrar o editar `.env`, `.env.online` y `credenciales.local.md`, e imprimir variables de entorno con secretos. Deja que `node --env-file` cargue `.env` para los scripts de npm; con `.env.online`, pregunta | Bloquea |
| `verificar-al-terminar` | Al terminar cada respuesta (*Stop*) | Mira el resultado, no los comandos: no deja cerrar con un test existente cambiado sin permiso ni, si hay cambios en `server/` o `client/`, con `npm test` en rojo | Avisa y deja terminar |
| `inicio-sesion` | Al empezar la sesión (*SessionStart*) | Muestra la línea «Bloque actual», `git status` con la rama, la regla de los tests y si hay una excepción abierta en `permiso-tests.txt` | Lo dice en el propio mensaje |

`shell.mjs` no es un hook: es el analizador de comandos que comparten los dos primeros.

Por qué: una regla escrita es una promesa, y un hook es un candado que se cumple aunque la IA se equivoque. Los filtros de comandos son una ayuda; la garantía para los tests es el hook *Stop*, que mira el resultado.

### Permisos ([`.claude/settings.json`](../.claude/settings.json))

| Tipo | Qué cubre | Por qué |
| --- | --- | --- |
| deny (19) | Leer los tres archivos con secretos; `git add`, `commit`, `push`, `reset`, `rm`, `restore`, `clean`, `stash` y `checkout`; `docker compose down` y `rm`, y `docker volume rm` | Git es del desarrollador y un push despliega; el volumen de Docker guarda la base de datos local |
| ask (9) | Cualquier `npm run …:online`, `psql`, `migrate`, `seed`, `content:import` y `demo:data` | Escriben en una base de datos; los `:online`, en la de producción (Neon) |
| allow (7) | `npm test`, `npm run test:api`, `build` y `typecheck`, `git status`, `git diff` y `git log` | No escriben en git ni en la base de datos de desarrollo (`test:api` solo reinicia `koma_test`, y aborta si la base no termina en `_test`). Menos interrupciones |

Los permisos solo ven el texto del comando: `git -C . push` no casa con `git push *`. Los hooks cubren parte de ese hueco.

### Tests que vigilan el código

Además de los tests de la app, algunos convierten reglas de `CLAUDE.md` en candados que corren con `npm test` y en la CI:

- `no-any.test.ts`: el código no usa `any` ni directivas que apaguen el comprobador de tipos.
- `client-parity.test.ts`: el cliente valida igual que el servidor, con las mismas constantes y mensajes.
- `layout.test.ts`: `theme-color` coincide con `--color-bg`.
- `claude-tree.test.ts`: cada ruta del árbol de `CLAUDE.md` existe.
- `hooks.test.ts`: lanza `proteger-secretos` contra secretos falsos en una carpeta temporal.

### Integración continua

[`.github/workflows/tests.yml`](../.github/workflows/tests.yml): en cada push y en cada pull request, typecheck, tests unitarios y tests de API con Postgres 18, con un `.env` de CI que no lleva secretos reales.

## 3. Desactivar un hook en una emergencia

Lo hace el desarrollador, nunca la IA: si un candado para a Claude, Claude se detiene y avisa. La emergencia típica es un hook que falla por dentro, porque entonces `proteger-tests` y `proteger-secretos` bloquean todo lo que vigilan.

Según la documentación de Claude Code ([hooks](https://code.claude.com/docs/en/hooks) y [settings](https://code.claude.com/docs/en/settings), consultada el 16-nov):

1. **Ver qué hooks hay activos:** `/hooks`. Es solo de lectura: enseña cada hook con su comando, pero no los desactiva.
2. **Una sesión sin hooks:** arrancar con `claude --settings '{"disableAllHooks": true}'`. No cambia ningún archivo y la sesión siguiente vuelve a tenerlos. Si la consola de Windows se come las comillas, `--settings` también acepta la ruta de un archivo JSON con ese contenido.
3. **Sin hooks en este ordenador, hasta arreglarlo:** `"disableAllHooks": true` en `.claude/settings.local.json`, que está fuera de git y manda sobre `.claude/settings.json`. Se quita en cuanto el hook vuelve a funcionar.
4. **Un solo hook:** borrar su entrada en `.claude/settings.json`. No hay forma de desactivar uno y dejarlo configurado. El cambio se ve en `git diff` y se deshace con git.

Además:

- Los cambios en los archivos de configuración se aplican sin reiniciar la sesión.
- Desactivar los hooks no quita los permisos: deny y ask siguen funcionando.
- Para cambiar un test existente con permiso no se desactiva nada. La IA para, explica qué aserción cambia y por qué, y espera el permiso ([`CLAUDE.md`](../CLAUDE.md), «Tests»). El desarrollador lista su ruta en `.claude/permiso-tests.txt` (una por línea; `#` comenta), que `proteger-tests` y el *Stop* respetan, y lo vacía al terminar. Mientras tenga entradas, `inicio-sesion` lo avisa.
- Al reactivarlos, la bitácora recoge qué falló y qué se hizo.

## 4. Ejemplos reales de la bitácora

| Entrada de [`bitacora.md`](bitacora.md) | Qué pasó | Qué cambió |
| --- | --- | --- |
| 2026-11-02 · Bloque 1 · Cierre del bloque | Un test nuevo pasaba con el código viejo y con el nuevo | Aprendizaje: ese test fija el contrato, pero no demuestra la corrección. Hoy `/constructor` exige ver fallar el test antes de programar, y el `auditor` lista los que pasarían con el código anterior |
| 2026-11-02 · Bloque 2 · Agente frontend y correcciones de sus revisiones | La primera revisión del `frontend` marcó como desvío una decisión aprobada que no se le había pasado | Al invocar un revisor, se le pasan todas las decisiones aprobadas |
| 2026-11-03 · Bloque 2 · Auditoría de T4–T7 y correcciones | El `auditor` detectó que `/files/%E0%A4%A` y `?q=%00` daban 500 | Reproducidos antes del arreglo; después, `URIError` da 404 y `\u0000` en la búsqueda da 400 |
| 2026-11-09 · Bloque 4 · Diseño de /admin (Codex), recuperado de su sesión | El worktree de Codex se borró antes de integrar su trabajo | Se recuperó de la sesión guardada de Codex. `/encargo-codex` dice ahora que el worktree no se borra hasta que su trabajo esté en un commit |
| 2026-11-14 · Pulido · Limpieza del harness, paso A | Al probar los candados, se respondió «sí» por inercia a `npm run seed:online` y el seed corrió contra Neon (es idempotente: no cambió nada) | Aprendizaje: una pregunta sobre producción se responde leyendo el comando |
| 2026-11-16 · Pulido · Limpieza del harness, paso B | `proteger-secretos` bloqueaba comandos legítimos como `sed 's/=.*//'`, porque expandía contra el disco los comodines entre comillas | Arreglado con test primero: `hooks.test.ts` (3 de 5 en verde con el hook viejo). Las pruebas de los hooks pasan al repositorio y a la CI |
| 16-nov · paso C, al escribir este documento | Un `wc -l docs/*.md` de la IA se bloqueó, porque el comodín incluía `docs/credenciales.local.md` | La IA repitió el comando nombrando los archivos uno a uno, sin el secreto |

## 5. Límites conocidos

- **Los filtros de comandos son aproximados.** No ven lo que hace un script guardado en un archivo ni `cat $(echo .env)`. Para los tests, la garantía es el *Stop*, que mira el resultado. Para los secretos no hay segunda red: por eso no están en el repositorio.
- **Falsos positivos.** `proteger-secretos` bloquea cualquier comando que nombre un secreto, aunque sea dentro de un texto: le pasó a un `python3` que solo decía «.env». Se acepta: es mejor parar de más que de menos.
- **Codex no pasa por estos candados,** que son de Claude Code. Trabaja en un worktree sin `.env`, y si cambia un test existente, el *Stop* lo detecta al traer su diff.
- **Modo auto.** En modo auto no se distingue lo que pregunta de lo que pasa sin preguntar, así que los candados se probaron en modo normal.
- **Qué se carga sin reiniciar la sesión:** los permisos, los hooks, una skill nueva en una carpeta de skills que ya existía, un agente cambiado y el `CLAUDE.md` de una carpeta al leer uno de sus archivos. Un agente nuevo no se ha vuelto a probar: en el bloque 2 no se cargó hasta la sesión siguiente.
- **Pendiente:** probar los hooks en Windows (la demo se presenta desde un portátil con Windows) y comprobar si los subagentes cargan los `CLAUDE.md` de carpeta; hoy los leen porque su archivo se lo pide.

## 6. Plugins

El proyecto no declara plugins en `.claude/settings.json` (decisión del desarrollador del 14-nov). Los plugins instalados para el usuario sí cambian el comportamiento de Claude: el segundo ordenador tiene `superpowers`, y si el otro no lo tiene, la misma petición puede seguir pasos distintos en cada uno. Antes de trabajar o de presentar, `/plugin` muestra qué hay instalado.

## 7. Cifras

Contadas el 16-nov sobre `4ce0396`, en la rama `develop`. Se repiten con el comando o el método de cada fila.

| Qué | Cifra | Cómo se cuenta |
| --- | --- | --- |
| Tests unitarios | 193 en verde, en 30 archivos | `npm test` |
| Tests de API | 310 en verde, en 39 archivos, contra Postgres (`koma_test`) | `npm run test:api` |
| Nombre de los tests | 243 llevan su regla (`RN-xx`) y 260, `Seguridad:`. Las 21 RN del plan tienen al menos un test | Las líneas `✔` de la salida de los dos comandos |
| Cobertura con los tests de API | 96,76 % de líneas, 91,79 % de ramas y 95,93 % de funciones, en los 81 archivos que cargan | `npm run test:api:coverage` |
| La misma, sobre todo el servidor | 86,31 % de líneas (5.827 de 6.751) | Cuenta como 0 % los 6 archivos que ningún test de API carga: `server.js`, `migrate.js`, `reset-test-db.js` y los tres `demo-*.js` |
| Cobertura con los tests unitarios | 70,90 % de líneas en los 36 archivos que cargan; 26,35 % sobre todo el servidor | `npm run test:coverage` |
| Revisiones de los agentes | 39 con veredicto anotado: 17 del `auditor` y 22 del `frontend`. De ellas, 11 APTO, 24 APTO CON OBSERVACIONES y 4 NO APTO | Cada veredicto de la bitácora. Las tres vueltas de Codex en la home se revisaron sin veredicto anotado y no cuentan |
| Hallazgos de esas revisiones | 218 anotados: 47 del `auditor` y 171 del `frontend` | La cifra que da cada revisión, o sus hallazgos numerados. Una del `auditor` no da cifra. No todos se corrigieron: algunos se aceptaron o quedaron para la decisión del desarrollador |
| Commits | 178, del 1 al 16-nov: 77 `docs`, 43 `feat`, 25 `fix`, 24 `chore`, 4 `test` y 5 de otros tipos | `git rev-list --count HEAD` y el prefijo de cada mensaje |
| Bloques | 5 bloques de construcción cerrados (1 a 5), más el bloque 0 de planificación; el pulido sigue en curso | El índice de la bitácora y sus entradas de cierre |
| Entradas de la bitácora | 91 | `grep -c '^### ' docs/bitacora.md`, sin contar la plantilla |

La cobertura es la del servidor: el código del cliente no se mide.
