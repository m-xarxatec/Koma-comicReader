import type { ComicCardDto, TagDto } from '../components/comic-card.js';
import { api } from '../services/api.js';
import { catalogQueryString } from '../utils/catalog.js';
import { sizeFromRatioToken } from '../utils/ratio.js';

// Ficha de la obra (CU-02, RN-07). La ruta HTML ya comprobó que la obra existe y es pública (404, 410) e
// inyectó el título; aquí se pinta el resto desde GET /api/comics/:slug. Todo dato de la obra va con
// textContent.

type ChapterAccess = 'free' | 'ad' | 'account' | 'balance';

interface ChapterSummaryDto {
  number: number;
  title: string;
  publishedAt: string;
  access: ChapterAccess;
  read: boolean;
}

interface ComicDto extends ComicCardDto {
  synopsis: string;
  publishedBy: string | null;
  license: string;
  licenseUrl: string | null;
  contentWarning: string | null;
  chapters: ChapterSummaryDto[];
}

// Estado de cada capítulo en la lista (D17): siempre con texto. "Usa 1 de saldo" no tiene estilo propio en la
// maqueta: lleva el de "Libre".
const CHAPTER_STATES: Record<ChapterAccess | 'read', { meta: string; label: string; style: 'free' | 'read' | 'locked'; icon: string | null }> = {
  read: { meta: 'Disponible para leer', label: 'Leído', style: 'read', icon: 'icon-check' },
  free: { meta: 'Disponible para leer', label: 'Libre', style: 'free', icon: null },
  balance: { meta: 'Usa 1 de tu saldo de lectura', label: 'Usa 1 de saldo', style: 'free', icon: null },
  ad: { meta: 'Se desbloquea con un anuncio', label: 'Con anuncio', style: 'locked', icon: 'icon-lock' },
  account: { meta: 'Requiere cuenta o Premium', label: 'Requiere cuenta', style: 'locked', icon: 'icon-lock' },
};

const slug = decodeURIComponent(location.pathname.split('/')[2] ?? '');
const store = { loading: false };

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const cover = byId<HTMLElement>('work-cover');
const status = byId<HTMLElement>('work-status');
const tags = byId<HTMLElement>('work-tags');
const body = byId<HTMLElement>('work-body');
const synopsis = byId<HTMLElement>('work-synopsis');
const author = byId<HTMLElement>('work-author');
const publisher = byId<HTMLElement>('work-publisher');
const license = byId<HTMLElement>('work-license');
const readLink = byId<HTMLAnchorElement>('work-read');
const readLabel = byId<HTMLElement>('work-read-label');
const warning = byId<HTMLElement>('work-warning');
const warningText = byId<HTMLElement>('work-warning-text');
const message = byId<HTMLElement>('work-message');
const chapters = byId<HTMLElement>('capitulos');
const chaptersSummary = byId<HTMLElement>('chapters-summary');
const chapterItems = byId<HTMLElement>('chapter-items');

function chapterUrl(number: number): string {
  return `/leer/${encodeURIComponent(slug)}/${number}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function icon(name: string, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `/icons/sprite.svg#${name}`);
  svg.append(use);
  return svg;
}

function showMessage(text: string, retry = false): void {
  if (!message) return;
  message.textContent = text;
  if (retry) {
    const button = document.createElement('button');
    button.className = 'button button--outline';
    button.type = 'button';
    button.textContent = 'Reintentar';
    button.addEventListener('click', () => { void loadComic(); });
    message.append(document.createElement('br'), button);
  }
}

function renderCover(comic: ComicDto): void {
  if (!cover) return;
  cover.replaceChildren();
  if (!comic.coverUrl) {
    cover.setAttribute('aria-hidden', 'true');
    return;
  }
  // Primera pantalla: sin loading="lazy".
  const image = document.createElement('img');
  image.className = 'work-detail__image';
  image.src = comic.coverUrl;
  image.alt = `Portada de ${comic.title}`;
  const size = sizeFromRatioToken('--work-cover-ratio');
  if (size) {
    image.width = size.width;
    image.height = size.height;
  }
  cover.removeAttribute('aria-hidden');
  cover.append(image);
}

function renderTags(list: TagDto[]): void {
  if (!tags) return;
  const label = document.createElement('dt');
  label.className = 'visually-hidden';
  label.textContent = 'Etiquetas';
  const items = [...list.filter((tag) => tag.type === 'genre'), ...list.filter((tag) => tag.type === 'theme')].map((tag) => {
    const item = document.createElement('dd');
    const link = document.createElement('a');
    link.className = `work-detail__tag work-detail__tag--${tag.type}`;
    link.href = `/${catalogQueryString({ q: '', tags: [tag.slug], page: 1 })}#catalogo`;
    link.textContent = tag.type === 'theme' ? `Temática: ${tag.name}` : tag.name;
    item.append(link);
    return item;
  });
  tags.replaceChildren(label, ...items);
  tags.hidden = items.length === 0;
}

function renderLicense(comic: ComicDto): void {
  if (!license) return;
  // El servidor solo guarda enlaces http(s); se vuelve a comprobar antes de ponerlo en un href.
  if (comic.licenseUrl && /^https?:\/\//i.test(comic.licenseUrl)) {
    const link = document.createElement('a');
    link.className = 'work-detail__license-link';
    link.href = comic.licenseUrl;
    link.rel = 'license noopener';
    link.textContent = comic.license;
    license.replaceChildren(link);
  } else {
    license.textContent = comic.license;
  }
}

function chapterItem(chapter: ChapterSummaryDto): HTMLLIElement {
  const state = CHAPTER_STATES[chapter.read ? 'read' : chapter.access];
  const item = document.createElement('li');
  item.className = `chapter-list__item${state.style === 'locked' ? ' chapter-list__item--locked' : ''}`;
  const link = document.createElement('a');
  link.className = 'chapter-list__link';
  link.href = chapterUrl(chapter.number);

  // El número en grande es decorativo: "Capítulo N" ya va en el texto del enlace.
  const number = document.createElement('span');
  number.className = 'chapter-list__number';
  number.setAttribute('aria-hidden', 'true');
  number.textContent = String(chapter.number).padStart(2, '0');

  const info = document.createElement('span');
  info.className = 'chapter-list__info';
  const name = document.createElement('strong');
  name.className = 'chapter-list__name';
  name.textContent = chapter.title;
  const meta = document.createElement('small');
  meta.className = 'chapter-list__meta';
  meta.textContent = `Capítulo ${chapter.number} · ${state.meta}`;
  info.append(name, meta);

  const badge = document.createElement('span');
  badge.className = `chapter-list__state chapter-list__state--${state.style}`;
  if (state.icon) badge.append(icon(state.icon, 'icon icon--small'), ' ');
  badge.append(state.label);

  link.append(number, info, badge, icon('icon-chevron', 'icon icon--small chapter-list__arrow'));
  item.append(link);
  return item;
}

function renderComic(comic: ComicDto): void {
  renderCover(comic);
  const count = comic.chapters.length;
  if (status) {
    status.textContent = plural(count, 'capítulo', 'capítulos');
    status.hidden = false;
  }
  renderTags(comic.tags);
  if (synopsis) synopsis.textContent = comic.synopsis;
  if (author) author.textContent = comic.authorCredit;
  // RN-07: el nombre del autor que la publicó o, si es importada, la plataforma.
  if (publisher) publisher.textContent = comic.publishedBy ?? 'La plataforma';
  renderLicense(comic);

  const first = comic.chapters[0];
  if (readLink && readLabel) {
    readLink.hidden = !first;
    if (first) {
      readLink.href = chapterUrl(first.number);
      readLabel.textContent = `Leer capítulo ${first.number}`;
    }
  }
  if (body) body.hidden = false;

  if (warning && warningText) {
    warningText.textContent = comic.contentWarning ?? '';
    warning.hidden = !comic.contentWarning;
  }

  if (chaptersSummary) {
    chaptersSummary.textContent = count === 0
      ? 'Todavía no hay capítulos publicados'
      : `${plural(count, 'episodio', 'episodios')} · Del primero al más reciente`;
  }
  chapterItems?.replaceChildren(...comic.chapters.map(chapterItem));
  if (chapters) chapters.hidden = false;
}

async function loadComic(): Promise<void> {
  if (store.loading) return;
  store.loading = true;
  showMessage('Cargando la obra...');
  const result = await api.get<{ comic: ComicDto }>(`/api/comics/${encodeURIComponent(slug)}`);
  if (result.ok) {
    showMessage('');
    renderComic(result.data.comic);
  } else {
    // 404 o 410 si la obra dejó de ser pública desde que se cargó la página; reintentar no lo arregla.
    showMessage(result.error.message, result.status !== 404 && result.status !== 410);
  }
  store.loading = false;
}

void loadComic();
