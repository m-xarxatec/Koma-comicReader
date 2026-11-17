// Direcciones de los reproductores de /tutoriales (CU-42; contrato del bloque 6, D12 y D13). Funciones puras: las
// prueba tests/unit/client-tutorials.test.ts.

// Id de un vídeo de YouTube. Repite YOUTUBE_ID_PATTERN de server/src/config/tutorials.ts (el test compara los dos).
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// Único origen que la CSP admite en un marco (frame-src): el reproductor de YouTube sin cookies (D12).
const EMBED_BASE = 'https://www.youtube-nocookie.com/embed/';

// El id llega de la API, pero se valida otra vez aquí: nunca se monta una URL con un valor sin comprobar.
export function embedUrl(id: string): string | null {
  return YOUTUBE_ID_PATTERN.test(id) ? `${EMBED_BASE}${id}` : null;
}

// Respaldo local (D13): el archivo que sirve GET /videos/:file.
export function localVideoUrl(id: string): string | null {
  return YOUTUBE_ID_PATTERN.test(id) ? `/videos/${id}.mp4` : null;
}
