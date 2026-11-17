import { api, type ApiError } from '../services/api.js';
import { embedUrl, localVideoUrl } from '../utils/tutorials.js';

// /tutoriales (CU-42; contrato del bloque 6, «Tutoriales» y «Páginas»). La lista llega de GET /api/tutorials y cada
// reproductor se crea con la API del DOM: un <iframe> de youtube-nocookie.com (D12) o, si el vídeo tiene archivo
// local, un <video> que lee /videos/<id>.mp4 (D13: la demo sin internet).

interface TutorialDto {
  id: string;
  title: string;
  description: string;
  local: boolean;
}

const list = document.querySelector<HTMLElement>('[data-tutorials-list]');
const status = document.querySelector<HTMLElement>('[data-tutorials-status]');

function setStatus(text: string): void {
  if (status) status.textContent = text;
}

function errorText(error: ApiError): string {
  return error.requestId ? `${error.message} (código de referencia: ${error.requestId})` : error.message;
}

// null si el id no es válido: ese vídeo no se pinta.
function player(tutorial: TutorialDto): HTMLElement | null {
  if (tutorial.local) {
    const src = localVideoUrl(tutorial.id);
    if (!src) return null;
    const video = document.createElement('video');
    video.className = 'tutorial-card__player';
    video.controls = true;
    video.preload = 'none'; // no descarga nada hasta que se pulsa reproducir
    video.src = src;
    video.setAttribute('aria-label', tutorial.title);
    return video;
  }
  const src = embedUrl(tutorial.id);
  if (!src) return null;
  const frame = document.createElement('iframe');
  frame.className = 'tutorial-card__player';
  frame.title = tutorial.title;
  frame.loading = 'lazy';
  // La página manda Referrer-Policy: same-origin y YouTube rechaza un incrustado sin Referer: este marco envía
  // solo el origen, el valor que recomienda YouTube para identificar al sitio.
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allowFullscreen = true;
  frame.src = src;
  return frame;
}

function tutorialCard(tutorial: TutorialDto): HTMLElement | null {
  const media = player(tutorial);
  if (!media) return null;

  const item = document.createElement('li');
  item.className = 'tutorial-card';
  const frame = document.createElement('div');
  frame.className = 'tutorial-card__frame';
  frame.append(media);

  const title = document.createElement('h2');
  title.className = 'tutorial-card__title';
  title.textContent = tutorial.title;
  const description = document.createElement('p');
  description.className = 'tutorial-card__description';
  description.textContent = tutorial.description;

  item.append(frame, title, description);
  return item;
}

async function loadTutorials(): Promise<void> {
  if (!list) return;
  setStatus('Cargando los tutoriales…');
  const result = await api.get<{ tutorials: TutorialDto[] }>('/api/tutorials');
  if (!result.ok) {
    setStatus(errorText(result.error));
    return;
  }
  const cards = result.data.tutorials.map(tutorialCard).filter((card) => card !== null);
  list.replaceChildren(...cards);
  list.hidden = cards.length === 0;
  setStatus(cards.length === 0 ? 'Todavía no hay tutoriales. Vuelve pronto.' : '');
}

void loadTutorials();
