import { access } from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from 'express';
import { VIDEO_FILE_PATTERN, YOUTUBE_ID_PATTERN, type Tutorial } from '../config/tutorials.js';
import { AppError } from './app-error.js';

// Tutoriales (CU-42; contrato del bloque 6, D11–D13): la lista con su respaldo local y la ruta que sirve los vídeos
// locales. No lee el entorno: app.ts le pasa la carpeta de TUTORIAL_VIDEOS_DIR (o null).

export interface TutorialDto extends Tutorial {
  local: boolean; // true si hay archivo local (D13): la página usa <video> en lugar de YouTube
}

// null = lista válida. Lo comprueba un test sobre la constante versionada (D11): id de YouTube válido y sin repetir,
// título y descripción con texto.
export function tutorialsProblem(tutorials: readonly Tutorial[]): string | null {
  const seen = new Set<string>();
  for (const tutorial of tutorials) {
    if (!YOUTUBE_ID_PATTERN.test(tutorial.id)) return `«${tutorial.id}» no es un id de YouTube (11 caracteres)`;
    if (seen.has(tutorial.id)) return `El id «${tutorial.id}» está repetido`;
    seen.add(tutorial.id);
    if (tutorial.title.trim() === '') return `El vídeo «${tutorial.id}» no tiene título`;
    if (tutorial.description.trim() === '') return `El vídeo «${tutorial.id}» no tiene descripción`;
  }
  return null;
}

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

// La lista con `local`: true solo si hay carpeta de respaldo y en ella está `<id>.mp4`.
export function listTutorials(tutorials: readonly Tutorial[], videosDir: string | null): Promise<TutorialDto[]> {
  return Promise.all(
    tutorials.map(async (tutorial) => ({
      ...tutorial,
      local: videosDir !== null && (await exists(path.join(videosDir, `${tutorial.id}.mp4`))),
    })),
  );
}

// GET /videos/:file (D13), solo con TUTORIAL_VIDEOS_DIR. El nombre se valida antes de tocar el disco y sendFile
// admite Range (200 o 206). Sin firma: son vídeos públicos de la plataforma, no contenido de usuarios.
export function createVideosHandler(videosDir: string): RequestHandler {
  const notFound = () => new AppError(404, 'NOT_FOUND', 'El vídeo no existe');
  return (req, res, next) => {
    const file = req.params['file'];
    if (typeof file !== 'string' || !VIDEO_FILE_PATTERN.test(file)) throw notFound();
    res.sendFile(file, { root: videosDir, dotfiles: 'deny' }, (err) => {
      if (!err || res.headersSent) return; // reproducción cortada por el cliente: no hay nada que responder
      next((err as { status?: unknown }).status === 404 ? notFound() : err);
    });
  };
}
