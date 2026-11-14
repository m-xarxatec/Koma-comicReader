---
name: entregar-commit
description: Prepara los comandos git add y git commit de una tarea cerrada, con el formato de commits de Koma, para que los ejecute el usuario. Usar al cerrar cada tarea o cuando el usuario diga «haz un commit» (significa «dame los comandos»).
argument-hint: "[qué se cierra, si no está claro]"
---

# Entregar commit

Tarea: $ARGUMENTS

Reglas: `CLAUDE.md`, «Convenciones» (git y commits) y «Definición de terminado» (lista del diff). Los permisos de `.claude/settings.json` bloquean `git add`, `git commit` y todo lo que escribe en git: aquí solo se lee (`git status`, `git diff`, `git log`) y se entregan los comandos.

## Pasos

1. **Leer el estado:** `git status --short --untracked-files=all` y `git diff --stat`, y el diff completo de lo que no hayas escrito tú en esta sesión.
2. **Elegir los archivos de esta tarea.** Si hay cambios ajenos a ella, no entran: nómbralos aparte y pregunta. Nunca:
   - `git add .`, `-A` ni comodines: cada ruta por su nombre;
   - secretos (`.env`, `.env.online`, `docs/credenciales.local.md`) ni nada que ignore git;
   - un test existente modificado o borrado sin el permiso de la excepción (`CLAUDE.md`, «Tests»): si aparece, para y avisa.
3. **Revisar el diff** con la lista «Antes de cada commit» de «Definición de terminado», y comprobar que `npm run typecheck` y `npm test` se ejecutaron en esta sesión después del último cambio. Si no, ejecútalos antes de entregar. Lo que no se haya comprobado se dice.
4. **Escribir el mensaje:** `tipo(módulo): qué cambia (regla)`, en español, en minúscula (salvo nombres propios) y sin punto final.
   - **tipo:** `feat` (función nueva), `fix` (corrección), `test` (solo tests), `refactor`, `style` (CSS o formato), `docs`, `chore` (configuración, harness o dependencias) o `ci`.
   - **módulo:** el de `server/src/modules/` o la zona que cambia (`reading`, `admin`, `author`, `claude`, `bitacora`, `plan`…). Se omite si no hay uno claro (`ci: …`).
   - **regla:** `(RN-xx)` si aplica una RN (varias: `(RN-01, RN-02)`); `(tarea X)` si cierra una tarea de un plan; nada si no hay ninguna.
   - Sin líneas de firma (`Co-Authored-By` ni parecidas).
5. **Entregar** un bloque listo para copiar, un commit por tarea:

   ```
   git add <ruta> <ruta>
   git commit -m "tipo(módulo): qué cambia (RN-xx)"
   ```

   Un archivo borrado también se registra con `git add <ruta>`. Si hay varios cambios independientes, un bloque por commit y en qué orden.
6. Si la tarea cierra un bloque o un paso de un plan, recuerda antes la entrada de bitácora (skill `bitacora`), para que vaya en el mismo commit o en el siguiente.
