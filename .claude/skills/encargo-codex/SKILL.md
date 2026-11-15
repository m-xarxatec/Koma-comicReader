---
name: encargo-codex
description: Redacta un encargo para Codex en .claude/encargos/ con la estructura de los encargos reales (contexto y apartados 0–6), el alcance de archivos cerrado, la regla de los tests y la de los secretos, y los pasos para integrar su trabajo sin perder el worktree. Solo lo lanza el usuario.
argument-hint: "<id y tema, p. ej. «E2 estadísticas de /admin»>"
disable-model-invocation: true
---

# Encargo para Codex

Encargo: $ARGUMENTS

Fuentes: los tres `CLAUDE.md` (raíz, `client/` y `server/`); en `docs/plan_mvp.md`, «Pulido» → «Pasada de diseño» (alcance de E1–E4, orden y lo que queda fuera de todos) o el contrato del bloque; como modelo, los encargos de `.claude/encargos/` (`codex-premium.md` es el más reciente). Los encargos antiguos son históricos: no se editan.

## Antes de redactar

Confirma con el usuario, sin suponer:
- el id, el objetivo y lo que queda fuera;
- el worktree y la rama (`../koma-<tema>` y `feat/<tema>`), que crea el usuario;
- si Codex necesita la maqueta: git la ignora, así que el usuario la copia en `.claude/maqueta/` del worktree;
- qué tests existentes podría tener que cambiar (en la pasada de diseño, solo `server/src/tests/api/pages.test.ts`, y con justificación).

Lee los archivos que tocará Codex y los tests que los comprueban, para escribir los apartados 2 y 4 con datos reales.

## Estructura

`.claude/encargos/codex-<tema>.md`, como los reales:

- **Título** `# Encargo para Codex · <id>: <tema> (Koma, <bloque>)` y **contexto**: el worktree y la rama, qué construir en una frase, que no lee nada fuera del worktree y lo que tiene dentro (los `CLAUDE.md`, `docs/`, la maqueta y sus archivos de referencia).
- **0. Antes de escribir código:** qué leer, en orden y con la sección exacta; la propuesta que entrega antes de programar, y que espera el OK; si algo choca con `CLAUDE.md` o con el contrato, pregunta.
- **1. Qué construir:** numerado, con los textos aprobados que no cambian y lo funcional que se mantiene (ganchos `data-*`, roles ARIA, formularios y enlaces sin JS).
- **2. Alcance de archivos:** «Puedes tocar» y «No toques», archivo por archivo, y la parte de git.
- **3. Reglas que no se negocian (de los `CLAUDE.md`):** solo las que afectan al encargo.
- **4. Lo que comprueban los tests:** las aserciones que tiene que mantener, test por test.
- **5. Comprobación:** su sandbox no tiene red (ni Postgres ni `test:api`); `npm run typecheck`, `npm test` y las búsquedas con `rg` del encargo; lo que comprueba el usuario en el navegador.
- **6. Entrega:** qué hizo, los archivos, las tablas o listas del encargo, lo que hay que mirar en el navegador, los comandos git y una entrada de bitácora propuesta como texto, sin editar `docs/bitacora.md`.

## Lo que dice todo encargo nuevo (los antiguos, no)

1. **Tests y secretos:** los tests existentes no se modifican ni se borran (`CLAUDE.md`, «Tests»), salvo lo que el encargo permita expresamente. No lee, crea ni copia `.env`, `.env.online` ni `docs/credenciales.local.md`.
2. **Un cambio en un test existente** se entrega con la aserción antes y después y su motivo, para que el usuario lo autorice y liste el archivo en `.claude/permiso-tests.txt` al integrarlo. Sin eso, `proteger-tests` y el hook *Stop* paran la integración: es lo esperado.
3. **`.claude/` está en git:** Codex no lo toca (salvo leer la maqueta) y sus commits no lo incluyen.
4. **Git lo maneja el usuario:** Codex entrega `git add` y `git commit` con el formato de commits de `CLAUDE.md` y sin líneas de firma.

## Integración, cuando Codex entrega

Según «Pasada de diseño»: revisar el diff, traerlo al árbol principal, pasar `frontend` y después `auditor`, typecheck y tests, y entregar los comandos git. Nada se integra si rompe el typecheck o los tests.

**El worktree y su rama no se borran** hasta que su trabajo esté en un commit de la rama de trabajo: `git diff <rama-de-trabajo> <rama-del-encargo> -- <archivos del alcance>` vacío, o cada diferencia explicada. En el bloque 4 se borró antes y hubo que recuperar el trabajo de la sesión de Codex (bitácora, 2026-11-09).
