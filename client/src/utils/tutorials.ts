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

// El mismo reproductor, para el visor (712e119): se crea al pulsar «Ver tutorial», así que empieza solo.
// playsinline evita que iOS lo pase a pantalla completa. frame-src no cambia: la query no cuenta para la CSP.
export function autoplayEmbedUrl(id: string): string | null {
  const url = embedUrl(id);
  return url === null ? null : `${url}?autoplay=1&playsinline=1`;
}

// Portada de cada tarjeta: client/public/icons/tutorials/<id>.webp, 640 × 360 (la genera /anadir-video; un test
// comprueba que cada vídeo de la lista tiene la suya).
export function coverUrl(id: string): string | null {
  return YOUTUBE_ID_PATTERN.test(id) ? `/icons/tutorials/${id}.webp` : null;
}

// Solo la primera portada cae siempre en la primera pantalla (client/CLAUDE.md): las demás, con carga diferida.
export const coverLoading = (index: number): 'eager' | 'lazy' => (index === 0 ? 'eager' : 'lazy');
