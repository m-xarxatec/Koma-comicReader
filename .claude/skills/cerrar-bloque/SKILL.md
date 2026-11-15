---
name: cerrar-bloque
description: Cierra un bloque del plan de Koma con la «Definición de terminado» de CLAUDE.md - comprobaciones, /code-review y /simplify, agentes frontend y auditor, línea «Bloque actual», CLAUDE.md al día y bitácora. Solo lo lanza el usuario.
argument-hint: "<bloque N | pulido>"
disable-model-invocation: true
---

# Cerrar bloque

Bloque: $ARGUMENTS

Fuentes (se leen, no se copian): en `CLAUDE.md`, «Definición de terminado» (las dos listas); en `docs/plan_mvp.md`, la sección del bloque (tareas y contrato) y «Calendario»; en `docs/bitacora.md`, las entradas del bloque, buscadas con `grep -n '^### '`.

Un paso cada vez. Al terminar cada uno, un resumen corto con lo comprobado; si hay algo que corregir, para y espera el OK. Un bloque no se da por cerrado con un punto en ✗.

## 1. Alcance

- Los commits del bloque: desde su cierre anterior (entrada de bitácora o commit) hasta `HEAD`. Si no está claro, pregunta el commit de partida.
- `git status`: limpio, o solo con lo de este cierre.
- Las tareas del bloque en el plan: cada una hecha, descartada o pendiente con su motivo.

## 2. Comprobaciones

`npm run typecheck`, `npm test` y `npm run test:api`. Este último necesita Postgres: si está parado, pide al usuario `docker compose up -d db`. Todo en verde antes de seguir.

## 3. Calidad del código

Sobre los cambios del bloque:
1. `/code-review`, nivel `high` salvo que el usuario pida otro: solo informa.
2. `/simplify`, con el árbol limpio, para que sus cambios queden como un diff aparte.

Cada hallazgo se propone al usuario. Los que acepte se aplican con su test (`CLAUDE.md`, «Tests»), y ninguno toca un test existente.

## 4. Agentes

Primero `frontend`, si el bloque tocó `client/`, `layout.ts`, `page.ts` o las plantillas de error; después `auditor`, con el alcance «bloque N». Sus hallazgos se tratan igual que en el paso 3.

## 5. Definición de terminado

Una tabla con cada punto de «Un bloque está cerrado solo cuando»:
- ✓, comprobado en esta sesión, con el dato;
- ✗, incumple;
- «manual», lo comprueba el usuario: despliegue online, móvil a 360 px, teclado y consola del navegador.

## 6. Documentación

- **`CLAUDE.md`:** la línea «Bloque actual» pasa al bloque siguiente de «Calendario», con el mismo formato (empieza por `- Bloque actual:`, que lee el hook `inicio-sesion`). Revisa también el árbol (lo vigila `claude-tree.test.ts`), la tabla de comandos frente a `package.json` y «Quién hace qué».
- **Bitácora:** la entrada «Cierre del bloque», con la skill `bitacora`, la tabla del paso 5 y lo manual pendiente.
- **Índice de la bitácora** (la tabla de «## Índice», al principio de `docs/bitacora.md`): en la fila del bloque, las fechas cerradas y el enlace a su primera entrada (si falta) y a la de cierre; después, una fila para el bloque siguiente, con «desde el <fecha>» y «—», que completará su propio cierre. El ancla es el título de la entrada en minúsculas, sin puntuación (`·`, `:`, paréntesis, comillas…) y con cada espacio cambiado por `-`, como en las filas que ya hay. Ningún otro cambio en la bitácora.

## 7. Entrega

Los commits con la skill `entregar-commit`: cada corrección de los pasos 3 y 4 en el suyo, y uno final con `CLAUDE.md` y la bitácora. Termina con la lista de lo manual que falta para cerrar el bloque de verdad.
