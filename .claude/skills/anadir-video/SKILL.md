---
name: anadir-video
description: Añade uno o varios vídeos de YouTube a la página Tutoriales de Koma (CU-42) a partir de su enlace - saca el título y la descripción de YouTube y los escribe en la lista versionada. Uso - /anadir-video <enlace> [<enlace> …]. Solo lo lanza el usuario.
argument-hint: "<enlace de YouTube> [<enlace> …]"
disable-model-invocation: true
---

# Añadir vídeo a Tutoriales

Enlaces: $ARGUMENTS

Todo lo que hace falta saber está aquí: no hay que leer `docs/` ni el resto del código.

## Cómo funciona Tutoriales (lo justo)

- La lista de vídeos es una constante: `TUTORIALS` en `server/src/config/tutorials.ts`. Cada entrada tiene `id` (el de YouTube, 11 caracteres), `title` y `description`. No hay tabla, ni migración, ni panel de admin.
- `GET /api/tutorials` devuelve esa lista y la página `/tutoriales` la pinta en ese orden, con el vídeo incrustado desde `youtube-nocookie.com`.
- Respaldo sin internet (solo local): si existe `<id>.mp4` en la carpeta de `TUTORIAL_VIDEOS_DIR` (`./videos` en Docker), la página reproduce ese archivo en lugar de YouTube. Los archivos los baja y los copia el desarrollador; no van a git.
- El test `server/src/tests/unit/tutorials.test.ts` valida la lista entera (id válido y sin repetir, título y descripción con texto). No hay que tocarlo ni escribir uno nuevo para añadir un vídeo.

## Pasos

1. **Ejecuta el script** con todos los enlaces (admite `watch?v=`, `youtu.be/`, `shorts/`, `embed/` o el id solo):

   ```
   node .claude/skills/anadir-video/anadir-video.mjs <enlace> [<enlace> …]
   ```

   - Saca el id, pide a YouTube el título y la descripción (primer párrafo, sin enlaces, 200 caracteres como mucho) y añade la entrada al final de `TUTORIALS`.
   - Un vídeo que ya está se omite. Uno privado, borrado o que no permite incrustarse da error y no se añade.
   - Con `--dry-run` delante solo enseña lo que añadiría.
   - Necesita internet. A YouTube solo se le envía el id del vídeo.
2. **Enseña al usuario** el título y la descripción de cada vídeo añadido. Si los quiere en otro idioma, más cortos o en otro orden, edita la entrada a mano en `server/src/config/tutorials.ts` (comillas simples; es el único archivo que cambia).
3. **Comprueba:** `npm test`, en verde. Si falla el test de la lista, el mensaje dice qué entrada está mal.
4. **Entrega el commit** (git lo ejecuta el usuario):

   ```
   git add server/src/config/tutorials.ts
   git commit -m "feat(tutorials): añade <n> vídeo(s) a Tutoriales (CU-42)"
   ```

5. **Recuerda al usuario** lo que solo puede hacer él:
   - ver el vídeo en `/tutoriales` (local y, tras desplegar, online);
   - para la demo sin internet, copiar `<id>.mp4` de cada vídeo nuevo a la carpeta de respaldo (el script imprime cada id).

## Quitar o reordenar

Se edita `TUTORIALS` a mano: borrar la entrada o moverla. Después, `npm test` y el mismo commit con el verbo que toque.

## No hacer

- No añadir campos a la entrada (canal, duración, miniatura): el contrato de la API es `id`, `title`, `description` y `local`.
- No bajar vídeos ni tocar `TUTORIAL_VIDEOS_DIR`, `.env` ni `docker-compose.yml`.
- No modificar los tests existentes.
