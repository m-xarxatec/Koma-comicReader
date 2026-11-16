// Tutoriales (CU-42; contrato del bloque 6, D11): lista fija y versionada de vídeos de YouTube. Sin tabla ni gestión
// desde /admin: para añadir o quitar un vídeo se edita esta constante.

export interface Tutorial {
  id: string; // id de YouTube, 11 caracteres
  title: string;
  description: string;
}

// Id de un vídeo de YouTube y nombre de su archivo de respaldo local (D13): `<id>.mp4`.
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
export const VIDEO_FILE_PATTERN = /^[A-Za-z0-9_-]{11}\.mp4$/;

// Se añaden con la skill `/anadir-video <enlace>` (.claude/skills/anadir-video/), que saca el título y la descripción
// de YouTube; el orden de la lista es el de la página.
export const TUTORIALS: readonly Tutorial[] = [
  {
    id: 'XeIR7P82aPU',
    title: 'How to start drawing (for beginners)',
    description: 'I\'m often asked how someone can start learning to draw from the very beginning, so this video is those people! There are certainly fundamentals and techniques you can learn, but I learnt with a much…',
  },
  {
    id: 'AmoW_LqwQ40',
    title: 'How to Draw Basic Anatomy',
    description: 'How to draw anatomy as a beginner! This is my first of a new series I\'m starting of art tutorials! Hope you enjoy, leave a comment on any art tutorials you\'d like me to make in the future!',
  },
  {
    id: 't-8FuHla3H0',
    title: 'How to draw ANY pose from ANY angle',
    description: 'Being able to draw poses from imagination has always been a lifelong artist dream of mine, so I did my best to FINALLY learn how to do that. It was a lot harder than I expected, though...',
  },
];
