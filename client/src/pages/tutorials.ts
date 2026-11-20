import { api, errorMessage } from '../services/api.js';
import { autoplayEmbedUrl, coverLoading, coverUrl, localVideoUrl } from '../utils/tutorials.js';

// /tutoriales (CU-42; contrato del bloque 6, «Tutoriales» y «Páginas»). La lista llega de GET /api/tutorials y cada
// tarjeta muestra su portada; al pulsarla, el visor crea el reproductor con la API del DOM: un <iframe> de
// youtube-nocookie.com (D12) o, si el vídeo tiene archivo local, un <video> que lee /videos/<id>.mp4 (D13: la demo
// sin internet). Al cerrar el visor se quita el reproductor.

interface TutorialDto {
  id: string;
  title: string;
  description: string;
  local: boolean;
}

const list = document.querySelector<HTMLElement>('[data-tutorials-list]');
const status = document.querySelector<HTMLElement>('[data-tutorials-status]');
// Visor modal (<dialog> con showModal, como el panel de comentarios): el foco no sale de él con Tab, Esc lo cierra
// y, al cerrarse, el foco vuelve a la tarjeta que lo abrió (lo hace el propio <dialog>).
const viewer = document.querySelector<HTMLDialogElement>('#tutorial-viewer');
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
  embed.src = src;
  return embed;
}

function stopPlayer(): void {
  frame?.querySelector('video')?.pause();
  // Quitar el iframe destruye el reproductor de YouTube, también si aún estaba cargando.
  frame?.replaceChildren();
}

// Todas las salidas (Cerrar, Esc, clic fuera, salir de la página) acaban en close, que para el vídeo.
viewer?.addEventListener('close', stopPlayer);
viewer?.querySelector('[data-viewer-close]')?.addEventListener('click', () => viewer.close());
// Un clic en el fondo llega al propio <dialog>: cierra solo si la pulsación empezó y acabó fuera de su caja (un
// arrastre desde dentro, p. ej. al seleccionar el título, no lo cierra).
const outside = (dialog: HTMLDialogElement, event: MouseEvent) => {
  const box = dialog.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
};
let pressedOutside = false;
viewer?.addEventListener('pointerdown', (event) => {
  pressedOutside = event.target === viewer && outside(viewer, event);
});
viewer?.addEventListener('click', (event) => {
  if (pressedOutside && event.target === viewer && outside(viewer, event)) viewer.close();
  pressedOutside = false;
});
// close llega en una tarea posterior: el vídeo se para ya, antes de que la página entre en la caché de Atrás.
window.addEventListener('pagehide', () => {
  stopPlayer();
  viewer?.close();
});

function tutorialCard(tutorial: TutorialDto, index: number): HTMLElement | null {
  const src = tutorial.local ? localVideoUrl(tutorial.id) : autoplayEmbedUrl(tutorial.id);
  const coverSrc = coverUrl(tutorial.id);
  if (!src || !coverSrc || !viewer || !frame || !viewerTitle) return null;

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
  cover.loading = coverLoading(index);
  cover.src = coverSrc;
  cover.addEventListener('error', () => cover.remove(), { once: true });
  const action = document.createElement('span');
  action.className = 'tutorial-card__action';
  action.textContent = 'Ver tutorial';
  open.append(cover, action);
  open.setAttribute('aria-label', `Ver tutorial: ${tutorial.title}`);
  open.addEventListener('click', () => {
    if (viewer.open) return;
    // Con puntero, algunos navegadores no enfocan el botón: así el diálogo devuelve el foco a esta tarjeta.
    open.focus({ preventScroll: true });
    viewerTitle.textContent = tutorial.title;
    frame.replaceChildren(player(tutorial, src));
    viewer.showModal();
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
