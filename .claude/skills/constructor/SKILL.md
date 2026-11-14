---
name: constructor
description: Construye una tarea o un bloque de Koma siguiendo CLAUDE.md y docs/, con el test escrito y visto fallar antes del código. Uso - /constructor bloque N | <tarea>.
argument-hint: "[bloque N | tarea concreta]"
disable-model-invocation: true
---

# Constructor

Tarea pedida: $ARGUMENTS

## Reglas

- `CLAUDE.md` manda; `docs/` es la especificación. Si algo falta o se contradice, para y pregunta. No elijas en silencio.
- Cada tarea es un cambio pequeño y verificable.
- Git: `CLAUDE.md`, «Convenciones». Los comandos los entrega la skill `entregar-commit`.
- Tests: `CLAUDE.md`, «Tests». Un test existente no se toca; si un cambio de contrato aprobado lo exige, para y sigue la excepción que describe esa sección. El hook `proteger-tests` lo bloquea, y solo el usuario lo desbloquea en `.claude/permiso-tests.txt`.
- Una afirmación como "funciona" o "pasa" solo vale si ejecutaste el comando en esta sesión. Si no lo ejecutaste, di que está sin verificar.
- Las migraciones ya aplicadas no se editan: se crea una nueva.
- En `docs/` solo puedes tocar tres cosas: las versiones exactas en `ideas_base.md` (Stack), los contratos de API en `plan_mvp.md` (con aprobación previa) y `bitacora.md`.

## Paso 0: estado

1. Lee la línea "Bloque actual" de `CLAUDE.md`, `git status` y la última entrada de `docs/bitacora.md`.
2. Si la tarea no pertenece al bloque actual o es de fase 2 o 3 fuera de "Fase 2 · bloque 5" (`docs/plan_mvp.md`), avisa y espera.

## Modo tarea

1. **Localizar.** Identifica el CU, las RN, las tablas (`docs/modelo_datos.md`), las rutas y el contrato en `docs/`. Si el contrato de API del bloque no está escrito, pídelo (`CLAUDE.md`, «Cuándo leer `docs/`»): propón el borrador en `plan_mvp.md` y espera su aprobación.
2. **Planificar.** Lista los archivos que vas a crear o tocar, las RN afectadas y los tests nuevos (archivo y nombre de cada uno). Si la tarea toca más de 5 archivos o incluye una migración, espera el OK.
3. **Test primero.** Escribe los tests en archivos nuevos de `server/src/tests/unit/` o `server/src/tests/api/`, con el nombre que pide «Tests». Ejecútalos (un solo archivo: el comando de «Tests») y míralos fallar en la ejecución, no en la compilación: si importan algo que aún no existe, crea antes su firma con un cuerpo provisional. En una corrección, el test reproduce el fallo con el código actual. Guarda la salida del fallo para la bitácora.
4. **Construir** en este orden, hasta que esos tests pasen: migración → repository → service → schema → controller → routes → cliente.
5. **Verificar.** Ejecuta `npm run typecheck`, `npm test` y `npm run test:api`, y haz una prueba manual con `curl` o el navegador.
6. **Autorrevisar** con la lista de revisión del diff de `CLAUDE.md`.
7. **Entregar:**
   - Qué se hizo, en 3–5 líneas, con el fallo visto en el paso 3.
   - Los comandos para probarlo.
   - Los comandos git, con la skill `entregar-commit`.
   - La entrada de bitácora, con la skill `bitacora`.
   - Al cerrar un bloque, recuerda al usuario `/cerrar-bloque`.
