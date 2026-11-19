import { api, errorMessage } from '../services/api.js';
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
const viewer = document.getElementById('tutorial-viewer');
const viewerTitle = document.getElementById('tutorial-viewer-title');
const frame = viewer?.querySelector<HTMLElement>('.tutorial-viewer__frame');

function setStatus(text: string): void {
  if (status) status.textContent = text;
}

function player(tutorial: TutorialDto, src: string): HTMLVideoElement | HTMLIFrameElement {
  if (tutorial.local) {
    const video = document.createElement('video');
    video.className = 'tutorial-viewer__player';
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.src = src;
    video.setAttribute('aria-label', tutorial.title);
    return video;
  }
  const embed = document.createElement('iframe');
  embed.className = 'tutorial-viewer__player';
  embed.title = tutorial.title;
  // La página manda Referrer-Policy: same-origin y YouTube rechaza un incrustado sin Referer: este marco envía
  // solo el origen, el valor que recomienda YouTube para identificar al sitio.
  embed.referrerPolicy = 'strict-origin-when-cross-origin';
  embed.allow = 'autoplay';
  embed.allowFullscreen = true;
  embed.src = `${src}?autoplay=1&playsinline=1`;
  return embed;
}

function stopPlayer(): void {
  frame?.querySelector('video')?.pause();
  // Quitar el iframe destruye el reproductor de YouTube, también si aún estaba cargando.
  frame?.replaceChildren();
}

viewer?.addEventListener('beforetoggle', (event) => {
  if ((event as ToggleEvent).newState === 'closed') stopPlayer();
});
window.addEventListener('pagehide', () => viewer?.hidePopover());

function tutorialCard(tutorial: TutorialDto): HTMLElement | null {
  const src = tutorial.local ? localVideoUrl(tutorial.id) : embedUrl(tutorial.id);
  if (!src || !viewer || !frame || !viewerTitle) return null;

  const item = document.createElement('li');
  item.className = 'tutorial-card';

  const title = document.createElement('h2');
  title.className = 'tutorial-card__title';
  title.textContent = tutorial.title;
  const description = document.createElement('p');
  description.className = 'tutorial-card__description';
  description.textContent = tutorial.description;

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'button button--outline tutorial-card__open';
  const cover = document.createElement('img');
  cover.className = 'tutorial-card__cover';
  cover.alt = '';
  cover.width = 640;
  cover.height = 360;
  cover.src = `/icons/tutorials/${tutorial.id}.webp`;
  cover.addEventListener('error', () => cover.remove(), { once: true });
  const action = document.createElement('span');
  action.className = 'tutorial-card__action';
  action.textContent = 'Ver tutorial';
  open.append(cover, action);
  open.setAttribute('aria-label', `Ver tutorial: ${tutorial.title}`);
  open.popoverTargetElement = viewer;
  open.popoverTargetAction = 'show';
  open.addEventListener('click', () => {
    open.focus({ preventScroll: true });
    stopPlayer();
    viewerTitle.textContent = tutorial.title;
    frame.replaceChildren(player(tutorial, src));
  });
  item.append(title, description, open);
  return item;
}

async function loadTutorials(): Promise<void> {
  if (!list) return;
  setStatus('Cargando los tutoriales…');
  const result = await api.get<{ tutorials: TutorialDto[] }>('/api/tutorials');
  if (!result.ok) {
    setStatus(errorMessage(result.error));
    return;
  }
  const cards = result.data.tutorials.map(tutorialCard).filter((card) => card !== null);
  list.replaceChildren(...cards);
  list.hidden = cards.length === 0;
  setStatus(cards.length === 0 ? 'Todavía no hay tutoriales. Vuelve pronto.' : '');
}

void loadTutorials();
