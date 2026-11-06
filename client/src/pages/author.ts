import type { TagDto } from '../components/comic-card.js';
import { api, type ApiError, type ApiResult } from '../services/api.js';
import {
  authorCreditProblem,
  bindForm,
  chapterNumberProblem,
  chapterTitleProblem,
  comicTitleProblem,
  contentWarningProblem,
  failureOutcome,
  MAX_IMAGE_BYTES,
  MAX_PANELS_PER_CHAPTER,
  synopsisProblem,
  tagsProblem,
  type SubmitOutcome,
} from '../utils/validate.js';

// Estudio del autor (/autor; CU-28 a CU-30, D18). El servidor ya comprobó la sesión y el rol de autor. La obra y el
// capítulo abiertos van en ?obra=<slug>&capitulo=<n>: los enlaces navegan de verdad y lo que cambia aquí (crear,
// retirar) actualiza la URL con history.pushState. Todo dato del autor se pinta con textContent; las peticiones van
// por api.ts y la API vuelve a comprobar el rol y la propiedad en cada una.

// --- Duplicado explícito del contrato del bloque 3 (server/src/modules/comics/comics.service.ts y
// chapters/chapters.service.ts) ---
type ComicStatus = 'pending' | 'approved' | 'rejected';
type ChapterStatus = 'draft' | 'pending' | 'approved' | 'rejected';

interface AuthorChapterSummaryDto {
  number: number;
  title: string;
  status: ChapterStatus;
  rejectionReason: string | null;
  panelCount: number;
  publishedAt: string | null;
}

interface AuthorComicDto {
  slug: string;
  title: string;
  synopsis: string;
  authorCredit: string;
  license: string;
  licenseUrl: string | null;
  tags: TagDto[];
  contentWarning: string | null;
  isAdult: boolean;
  coverUrl: string | null;
  status: ComicStatus;
  rejectionReason: string | null;
  createdAt: string;
  chapters: AuthorChapterSummaryDto[];
}

interface AuthorPanelDto {
  position: number;
  url: string;
  width: number;
  height: number;
}

interface AuthorChapterDto extends AuthorChapterSummaryDto {
  panels: AuthorPanelDto[];
}

const COMIC_STATUS: Record<ComicStatus, { label: string; tone: string }> = {
  approved: { label: 'Publicada', tone: 'success' },
  pending: { label: 'En revisión', tone: 'warning' },
  rejected: { label: 'Rechazada', tone: 'danger' },
};
const CHAPTER_STATUS: Record<ChapterStatus, { label: string; tone: string }> = {
  draft: { label: 'Borrador', tone: '' },
  pending: { label: 'En revisión', tone: 'warning' },
  approved: { label: 'Publicado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
};

const store: {
  comics: AuthorComicDto[];
  tags: TagDto[];
  chapter: AuthorChapterDto | null; // el capítulo abierto en el editor
  busy: boolean; // una operación del editor en curso: los botones esperan
  chapterRequest: number; // descarta la respuesta de un capítulo que ya no es el abierto
} = { comics: [], tags: [], chapter: null, busy: false, chapterRequest: 0 };

// --- Utilidades ---

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Falta #${id} en author.html`);
  return element as T;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function badge(target: HTMLElement, status: { label: string; tone: string }): HTMLElement {
  target.className = status.tone ? `status-badge status-badge--${status.tone}` : 'status-badge';
  target.textContent = status.label;
  return target;
}

const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const isLive = (chapter: AuthorChapterSummaryDto) => chapter.status !== 'rejected';

// Mensaje de un fallo de la API (con el código de referencia si es del servidor o de la red).
function errorText(result: { status: number; error: ApiError }): string {
  const outcome = failureOutcome(result.status, result.error);
  return outcome.ok ? '' : outcome.message;
}

const comicUrl = (slug: string) => `/api/author/comics/${encodeURIComponent(slug)}`;
const chapterUrl = (slug: string, number: number) => `${comicUrl(slug)}/chapters/${number}`;
const studioUrl = (slug?: string, number?: number) => {
  const params = new URLSearchParams();
  if (slug) params.set('obra', slug);
  if (number !== undefined) params.set('capitulo', String(number));
  const query = params.toString();
  return `/autor${query ? `?${query}` : ''}${number !== undefined ? '#capitulo' : slug ? '#obra' : '#mis-obras'}`;
};

function imageForm(file: File): FormData {
  const form = new FormData();
  form.append('image', file);
  return form;
}

// Regiones role="status" de cada sección: verde si es un éxito y rojo si es un fallo (.form__status--error).
function say(region: HTMLElement, message: string, error = false): void {
  region.classList.toggle('form__status--error', error);
  region.textContent = message;
}

function focusHeading(id: string): void {
  const heading = document.getElementById(id);
  heading?.focus();
  heading?.scrollIntoView({ block: 'start' });
}

// --- Resumen, obras y revisiones ---

const worksList = byId<HTMLUListElement>('works-list');
const worksMessage = byId<HTMLElement>('works-message');
const worksStatus = byId<HTMLElement>('works-status');
const reviewsList = byId<HTMLUListElement>('reviews-list');
const reviewsMessage = byId<HTMLElement>('reviews-message');

function renderMetrics(): void {
  const chapters = store.comics.flatMap((comic) => comic.chapters);
  const values: Record<string, number> = {
    published: store.comics.filter((comic) => comic.status === 'approved').length,
    drafts: chapters.filter((chapter) => chapter.status === 'draft').length,
    review: store.comics.filter((comic) => comic.status === 'pending').length + chapters.filter((chapter) => chapter.status === 'pending').length,
  };
  for (const element of document.querySelectorAll<HTMLElement>('[data-metric]')) {
    element.textContent = String(values[element.dataset['metric'] ?? ''] ?? 0).padStart(2, '0');
  }
}

function workTile(comic: AuthorComicDto): HTMLLIElement {
  const item = el('li');
  const article = el('article', 'work-tile');
  const cover = el('div', 'work-tile__cover');
  cover.setAttribute('aria-hidden', 'true');
  if (comic.coverUrl) {
    const image = el('img', 'work-tile__cover-image');
    image.src = comic.coverUrl;
    image.alt = '';
    image.loading = 'lazy';
    cover.append(image);
  } else {
    cover.textContent = 'Sin portada';
  }

  const body = el('div', 'work-tile__body');
  const top = el('div', 'work-tile__top');
  top.append(badge(el('span'), COMIC_STATUS[comic.status]), el('span', 'work-tile__meta', plural(comic.chapters.filter(isLive).length, 'capítulo', 'capítulos')));
  // Acciones según el estado, como la maqueta: la ficha si está publicada; si está en revisión o rechazada, sus
  // revisiones (el motivo). Siempre "Gestionar →" (capítulos, portada y retirada).
  const actions = el('div', 'work-tile__actions');
  const action = (label: string, href: string, name: string, className = 'button button--outline') => {
    const link = el('a', className, label);
    link.href = href;
    link.setAttribute('aria-label', name);
    actions.append(link);
  };
  if (comic.status === 'approved') action('Ver ficha', `/obra/${encodeURIComponent(comic.slug)}`, `Ver la ficha de ${comic.title}`);
  if (comic.status === 'rejected') action('Ver motivo', '#revisiones', `Ver el motivo del rechazo de ${comic.title}`);
  action('Gestionar →', studioUrl(comic.slug), `Gestionar ${comic.title}`, 'text-link');
  if (comic.status === 'pending') action('Revisiones →', '#revisiones', `Revisiones de ${comic.title}`, 'text-link');
  body.append(top, el('h3', 'work-tile__title', comic.title), el('p', 'work-tile__tags', comic.tags.map((tag) => tag.name).join(' · ')), actions);

  article.append(cover, body);
  item.append(article);
  return item;
}

function reviewNotice(title: string, status: { label: string; tone: string }, text: string, reason: string | null, link?: { href: string; label: string }): HTMLLIElement {
  const item = el('li', reason ? 'review-notice' : 'review-notice review-notice--neutral');
  const top = el('div', 'review-notice__top');
  top.append(badge(el('span'), status));
  item.append(top, el('h3', 'review-notice__title', title));
  if (reason) {
    const why = el('p', 'review-notice__reason');
    why.append(el('strong', '', 'Motivo: '), document.createTextNode(reason));
    item.append(why);
  }
  item.append(el('p', 'review-notice__text', text));
  if (link) {
    const anchor = el('a', 'button button--outline', link.label);
    anchor.href = link.href;
    item.append(anchor);
  }
  return item;
}

function renderReviews(): void {
  const items: HTMLLIElement[] = [];
  for (const comic of store.comics) {
    if (comic.status === 'rejected') {
      items.push(reviewNotice(comic.title, { label: 'Rechazada', tone: 'danger' }, 'Una obra rechazada no se puede volver a enviar.', comic.rejectionReason));
    } else if (comic.status === 'pending') {
      items.push(reviewNotice(comic.title, { label: 'Pendiente', tone: 'warning' }, 'Tu obra está en la cola de moderación. Todavía no hay observaciones.', null));
    }
    for (const chapter of comic.chapters) {
      const title = `${comic.title} · Capítulo ${chapter.number}`;
      if (chapter.status === 'rejected') {
        const text = 'Revisa estos puntos y crea otro capítulo con el mismo número para enviar una nueva versión.';
        items.push(reviewNotice(title, { label: 'Cambios requeridos', tone: 'danger' }, text, chapter.rejectionReason, comic.status === 'rejected' ? undefined : { href: studioUrl(comic.slug), label: 'Corregir capítulo' }));
      } else if (chapter.status === 'pending') {
        items.push(reviewNotice(title, { label: 'Pendiente', tone: 'warning' }, 'Tu envío está en la cola de moderación. Todavía no hay observaciones.', null));
      }
    }
  }
  reviewsList.replaceChildren(...items);
  reviewsMessage.textContent = items.length === 0 ? 'No tienes envíos pendientes ni rechazos.' : '';
}

function renderWorks(): void {
  worksList.replaceChildren(...store.comics.map(workTile));
  byId('works-count').textContent = plural(store.comics.length, 'obra', 'obras');
  worksMessage.textContent = store.comics.length === 0 ? 'Todavía no has creado ninguna obra. Empieza con «Crear obra».' : '';
  renderMetrics();
  renderReviews();
}

// Vuelve a pedir las obras (tras crear, subir, retirar…) y repinta todo lo que depende de ellas.
async function reloadComics(): Promise<boolean> {
  const result = await api.get<{ comics: AuthorComicDto[] }>('/api/author/comics');
  if (!result.ok) {
    worksMessage.textContent = `No se pudieron cargar tus obras. ${errorText(result)}`; // texto, no aviso de estado
    return false;
  }
  store.comics = result.data.comics;
  renderWorks();
  return true;
}

// --- Crear obra (CU-28) ---

const comicForm = byId<HTMLFormElement>('comic-form');
const tagChoices = byId<HTMLElement>('comic-tags-choices');
const coverInput = byId<HTMLInputElement>('comic-cover');
const warningToggle = byId<HTMLInputElement>('comic-has-warning');
const warningField = byId<HTMLElement>('comic-warning-field');

function renderTags(): void {
  const groups: [TagDto['type'], string][] = [
    ['genre', 'Géneros'],
    ['theme', 'Temas'],
  ];
  let first = true;
  const blocks = groups.map(([type, title]) => {
    const group = el('div', 'form__choices-group');
    group.append(el('p', 'form__choices-title', title));
    for (const tag of store.tags.filter((candidate) => candidate.type === type)) {
      const label = el('label', 'form__check');
      const input = el('input', 'form__check-input');
      input.type = 'checkbox';
      input.name = 'tags';
      input.value = tag.slug;
      input.dataset['type'] = tag.type;
      input.id = first ? 'comic-tags' : `comic-tags-${tag.slug}`;
      if (first) input.setAttribute('aria-describedby', 'comic-tags-error');
      first = false;
      label.append(input, el('span', '', tag.name));
      group.append(label);
    }
    return group;
  });
  tagChoices.replaceChildren(...blocks);
}

// bindForm borra el error de un campo al escribir en él; las etiquetas son varias casillas y el error es del grupo:
// cualquier casilla lo borra.
tagChoices.addEventListener('change', (event) => {
  if (!(event.target instanceof HTMLInputElement) || event.target.name !== 'tags') return;
  const first = byId<HTMLInputElement>('comic-tags');
  first.removeAttribute('aria-invalid');
  const error = byId<HTMLElement>('comic-tags-error');
  error.textContent = '';
  error.hidden = true;
});

function selectedTags(): { slug: string; type: TagDto['type'] }[] {
  return [...comicForm.querySelectorAll<HTMLInputElement>('input[name="tags"]:checked')].map((input) => ({
    slug: input.value,
    type: input.dataset['type'] === 'genre' ? 'genre' : 'theme',
  }));
}

function syncWarningField(): void {
  warningField.hidden = !warningToggle.checked;
}
warningToggle.addEventListener('change', syncWarningField);
comicForm.addEventListener('reset', () => queueMicrotask(syncWarningField));

const AUTHORSHIP_REQUIRED = 'Debes declarar que eres el autor de la obra o que tienes permiso para publicarla';

async function uploadCover(slug: string, file: File): Promise<ApiResult<{ comic: AuthorComicDto }>> {
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: { code: 'FILE_TOO_LARGE', message: 'La imagen no puede pasar de 5 MB', requestId: '' } };
  }
  return api.put<{ comic: AuthorComicDto }>(`${comicUrl(slug)}/cover`, imageForm(file));
}

bindForm(
  comicForm,
  {
    title: comicTitleProblem,
    synopsis: synopsisProblem,
    authorCredit: authorCreditProblem,
    license: (value) => (value === '' ? 'Elige una licencia de la lista' : null),
    tags: () => tagsProblem(selectedTags()),
    contentWarning: (value, values) => (values['hasWarning'] ? contentWarningProblem(value) : null),
    authorshipDeclared: (value) => (value === '' ? AUTHORSHIP_REQUIRED : null),
  },
  async (values): Promise<SubmitOutcome> => {
    const result = await api.post<{ comic: AuthorComicDto }>('/api/author/comics', {
      title: values['title'] ?? '',
      synopsis: values['synopsis'] ?? '',
      authorCredit: values['authorCredit'] ?? '',
      license: values['license'] ?? '',
      tags: selectedTags().map((tag) => tag.slug),
      contentWarning: values['hasWarning'] ? (values['contentWarning'] ?? '') : null,
      isAdult: values['isAdult'] === 'true',
      authorshipDeclared: values['authorshipDeclared'] === 'true',
    });
    if (!result.ok) return failureOutcome(result.status, result.error);

    // D7: la portada es opcional y va aparte; si falla, la obra ya existe y se puede subir desde "Cambiar portada".
    const created = result.data.comic;
    let message = 'Obra creada: está en revisión.';
    let coverFailed = false;
    const cover = coverInput.files?.[0];
    if (cover) {
      const upload = await uploadCover(created.slug, cover);
      coverFailed = !upload.ok;
      if (!upload.ok) message += ` La portada no se pudo subir (${errorText(upload)}): súbela desde «Cambiar portada».`;
    }
    comicForm.reset();
    await reloadComics();
    history.pushState(null, '', studioUrl(created.slug));
    await route({ focus: true, comicMessage: message, comicMessageIsError: coverFailed });
    return { ok: true };
  },
);

// --- Obra abierta (?obra=) ---

const comicSection = byId<HTMLElement>('obra');
const comicTitle = byId<HTMLElement>('obra-title');
const comicBadge = byId<HTMLElement>('obra-status');
const comicFeedback = byId<HTMLElement>('obra-feedback');
const comicMessage = byId<HTMLElement>('obra-message');
const comicBody = byId<HTMLElement>('obra-body');
const comicPublic = byId<HTMLAnchorElement>('obra-public');
const comicCoverControl = byId<HTMLElement>('obra-cover-control');
const comicCoverInput = byId<HTMLInputElement>('obra-cover');
const comicWithdraw = byId<HTMLButtonElement>('obra-withdraw');
const chapterRows = byId<HTMLTableSectionElement>('chapter-rows');
const chaptersEmpty = byId<HTMLElement>('chapters-empty');
const chapterForm = byId<HTMLFormElement>('chapter-form');
const chapterNumber = byId<HTMLInputElement>('chapter-number');
const newChapter = byId<HTMLElement>('nuevo-capitulo');

const currentSlug = () => new URLSearchParams(location.search).get('obra');
const currentComic = () => store.comics.find((comic) => comic.slug === currentSlug()) ?? null;

function chapterRow(comic: AuthorComicDto, chapter: AuthorChapterSummaryDto): HTMLTableRowElement {
  const row = el('tr', 'chapter-table__row');
  const number = el('th', 'chapter-table__cell', String(chapter.number));
  number.scope = 'row';
  const state = el('td', 'chapter-table__cell');
  state.append(badge(el('span'), CHAPTER_STATUS[chapter.status]));
  if (chapter.rejectionReason) state.append(el('span', 'chapter-table__reason', `Motivo: ${chapter.rejectionReason}`));
  const published = el('td', 'chapter-table__cell', chapter.publishedAt ? dateFormat.format(new Date(chapter.publishedAt)) : 'Sin publicar');
  const actions = el('td', 'chapter-table__cell');
  const buttons = el('div', 'chapter-table__actions');
  if (isLive(chapter)) {
    const open = el('a', 'button button--outline', chapter.status === 'draft' && comic.status !== 'rejected' ? 'Editar' : 'Ver');
    open.href = studioUrl(comic.slug, chapter.number);
    open.setAttribute('aria-label', `${open.textContent} el capítulo ${chapter.number}`);
    const withdraw = el('button', 'button button--outline button--danger', 'Retirar');
    withdraw.type = 'button';
    withdraw.setAttribute('aria-label', `Retirar el capítulo ${chapter.number}`);
    withdraw.addEventListener('click', () => withdrawChapter(comic, chapter.number));
    buttons.append(open, withdraw);
  }
  actions.append(buttons);
  row.append(number, el('td', 'chapter-table__cell chapter-table__title', chapter.title), state, el('td', 'chapter-table__cell', String(chapter.panelCount)), published, actions);
  return row;
}

function renderComic(): void {
  const slug = currentSlug();
  comicSection.hidden = slug === null;
  document.querySelector<HTMLElement>('[data-nav="comic"]')!.hidden = slug === null;
  if (slug === null) return;
  const comic = currentComic();
  if (!comic) {
    comicTitle.textContent = 'Obra no encontrada';
    comicBadge.textContent = '';
    comicMessage.textContent = 'No encontramos esa obra entre las tuyas: puede que se haya retirado o que el enlace no sea correcto.';
    comicBody.hidden = true;
    return;
  }
  comicTitle.textContent = comic.title;
  badge(comicBadge, COMIC_STATUS[comic.status]);
  const rejected = comic.status === 'rejected';
  comicMessage.textContent = rejected
    ? `Rechazada. Motivo: ${comic.rejectionReason ?? ''} Una obra rechazada ya no admite capítulos ni cambios.`
    : comic.status === 'pending'
      ? 'En revisión: todavía no es pública. Puedes ir preparando sus capítulos.'
      : '';
  comicBody.hidden = false;
  comicPublic.hidden = comic.status !== 'approved';
  comicPublic.href = `/obra/${encodeURIComponent(comic.slug)}`;
  comicCoverControl.hidden = rejected; // D8
  newChapter.hidden = rejected;

  byId('chapters-caption').textContent = `Capítulos de «${comic.title}»`;
  chapterRows.replaceChildren(...comic.chapters.map((chapter) => chapterRow(comic, chapter)));
  chaptersEmpty.hidden = comic.chapters.length > 0;
  // D22: el formulario propone el siguiente número libre.
  const live = comic.chapters.filter(isLive).map((chapter) => chapter.number);
  chapterNumber.value = String(live.length > 0 ? Math.max(...live) + 1 : 1);
}

comicCoverInput.addEventListener('change', async () => {
  const comic = currentComic();
  const file = comicCoverInput.files?.[0];
  if (!comic || !file) return;
  comicCoverInput.disabled = true;
  say(comicFeedback, 'Subiendo la portada…');
  const result = await uploadCover(comic.slug, file);
  comicCoverInput.disabled = false;
  comicCoverInput.value = '';
  comicCoverInput.focus(); // se desactivó con el foco dentro: se le devuelve
  if (!result.ok) {
    say(comicFeedback, `No se pudo cambiar la portada. ${errorText(result)}`, true);
    return;
  }
  await reloadComics();
  say(comicFeedback, 'Portada actualizada.');
});

comicWithdraw.addEventListener('click', async () => {
  const comic = currentComic();
  if (!comic) return;
  if (!confirm(`¿Retirar «${comic.title}»? Dejará de estar visible para los lectores y no se puede deshacer desde el estudio.`)) return;
  comicWithdraw.disabled = true;
  const result = await api.post<void>(`/api/comics/${encodeURIComponent(comic.slug)}/withdraw`);
  comicWithdraw.disabled = false;
  if (!result.ok) {
    comicWithdraw.focus();
    say(comicFeedback, `No se pudo retirar la obra. ${errorText(result)}`, true);
    return;
  }
  await reloadComics();
  history.pushState(null, '', studioUrl());
  await route();
  say(worksStatus, `«${comic.title}» se ha retirado.`);
  focusHeading('mis-obras-title');
});

async function withdrawChapter(comic: AuthorComicDto, number: number): Promise<void> {
  if (!confirm(`¿Retirar el capítulo ${number}? Dejará de estar visible y su número quedará libre.`)) return;
  const result = await api.post<void>(`${chapterUrl(comic.slug, number)}/withdraw`);
  if (!result.ok) {
    say(comicFeedback, `No se pudo retirar el capítulo ${number}. ${errorText(result)}`, true);
    return;
  }
  await reloadComics();
  const open = new URLSearchParams(location.search).get('capitulo');
  if (open === String(number)) history.pushState(null, '', studioUrl(comic.slug));
  await route();
  say(comicFeedback, `Capítulo ${number} retirado.`);
  focusHeading('obra-title');
}

bindForm(chapterForm, { number: chapterNumberProblem, title: chapterTitleProblem }, async (values): Promise<SubmitOutcome> => {
  const comic = currentComic();
  if (!comic) return { ok: false, message: 'La obra ya no está disponible.' };
  const number = Number((values['number'] ?? '').trim());
  const title = (values['title'] ?? '').trim();
  const result = await api.post<{ chapter: AuthorChapterDto }>(`${comicUrl(comic.slug)}/chapters`, { number, ...(title !== '' && { title }) });
  if (!result.ok) {
    const outcome = failureOutcome(result.status, result.error);
    // El número ocupado (409) es un error del campo, no del formulario.
    return result.error.code === 'CONFLICT' && !outcome.ok ? { ...outcome, fields: { number: outcome.message } } : outcome;
  }
  chapterForm.reset();
  await reloadComics();
  history.pushState(null, '', studioUrl(comic.slug, number));
  await route({ focus: true, chapterMessage: 'Borrador creado: añade sus viñetas.' });
  return { ok: true };
});

// --- Editor del capítulo abierto (?capitulo=; RN-05, RN-10, D9) ---

const chapterSection = byId<HTMLElement>('capitulo');
const editorTitle = byId<HTMLElement>('capitulo-title');
const editorComic = byId<HTMLElement>('capitulo-comic');
const editorBadge = byId<HTMLElement>('capitulo-status');
const editorMessage = byId<HTMLElement>('capitulo-message');
const editorBody = byId<HTMLElement>('capitulo-body');
const editorUpload = byId<HTMLElement>('editor-upload');
const editorImages = byId<HTMLInputElement>('editor-images');
const editorList = byId<HTMLOListElement>('editor-list');
const editorEmpty = byId<HTMLElement>('editor-empty');
const editorCount = byId<HTMLElement>('editor-count');
const editorStatus = byId<HTMLElement>('editor-status');
const editorSubmit = byId<HTMLButtonElement>('editor-submit');
const editorWithdraw = byId<HTMLButtonElement>('editor-withdraw');
const editorNote = byId<HTMLElement>('editor-note');
const editorStrip = byId<HTMLElement>('editor-strip');

const editable = () => store.chapter?.status === 'draft' && currentComic()?.status !== 'rejected';

function panelButton(action: 'up' | 'down' | 'remove', position: number, total: number): HTMLButtonElement {
  const labels = { up: ['↑', 'Mover arriba', 'Subir'], down: ['↓', 'Mover abajo', 'Bajar'], remove: ['×', 'Eliminar', 'Eliminar'] } as const;
  const [symbol, title, verb] = labels[action];
  const button = el('button', action === 'remove' ? 'chapter-editor__button chapter-editor__button--remove' : 'chapter-editor__button', symbol);
  button.type = 'button';
  button.title = title;
  button.dataset['action'] = action;
  button.dataset['position'] = String(position);
  button.setAttribute('aria-label', `${verb} la viñeta ${position}`);
  // D9: la primera no sube y la última no baja.
  button.disabled = store.busy || (action === 'up' && position === 1) || (action === 'down' && position === total);
  return button;
}

function renderEditor(): void {
  const chapter = store.chapter;
  if (!chapter) return;
  const canEdit = editable();
  const total = chapter.panels.length;
  editorTitle.textContent = chapter.title === `Capítulo ${chapter.number}` ? chapter.title : `Capítulo ${chapter.number}: ${chapter.title}`;
  editorComic.textContent = currentComic()?.title ?? '';
  badge(editorBadge, CHAPTER_STATUS[chapter.status]);
  editorBody.hidden = false;
  editorUpload.hidden = !canEdit;
  editorSubmit.hidden = !canEdit;
  editorCount.textContent = plural(total, 'imagen', 'imágenes');
  editorEmpty.hidden = total > 0;
  editorNote.textContent =
    currentComic()?.status === 'rejected'
      ? 'La obra está rechazada: sus capítulos ya no se editan.'
      : chapter.status === 'draft'
        ? 'Al enviarlo a revisión ya no podrás editarlo.'
        : chapter.status === 'pending'
          ? 'En revisión: ya no se puede editar. Si necesitas cambiarlo, retíralo y crea otro con el mismo número.'
          : 'Publicado. Para cambiarlo, retíralo y crea otro con el mismo número.';

  editorList.replaceChildren(
    ...chapter.panels.map((panel) => {
      const row = el('li', 'chapter-editor__row');
      const thumb = el('span', 'chapter-editor__thumb');
      thumb.setAttribute('aria-hidden', 'true');
      const image = el('img', 'chapter-editor__thumb-image');
      image.src = panel.url;
      image.alt = '';
      image.width = panel.width;
      image.height = panel.height;
      image.loading = 'lazy';
      thumb.append(image);
      const text = el('div', 'chapter-editor__row-text');
      text.append(el('strong', 'chapter-editor__row-title', `Viñeta ${panel.position}`), el('span', 'chapter-editor__row-meta', `${panel.width} × ${panel.height} px`));
      row.append(thumb, text);
      if (canEdit) {
        const buttons = el('div', 'chapter-editor__buttons');
        buttons.append(panelButton('up', panel.position, total), panelButton('down', panel.position, total), panelButton('remove', panel.position, total));
        row.append(buttons);
      }
      return row;
    }),
  );

  editorStrip.replaceChildren(
    ...chapter.panels.map((panel) => {
      const image = el('img', 'chapter-editor__strip-image');
      image.src = panel.url;
      image.alt = `Viñeta ${panel.position}`;
      image.width = panel.width;
      image.height = panel.height;
      image.loading = 'lazy';
      return image;
    }),
  );
  syncBusy();
}

// Mientras una operación del editor está en curso, nada más se puede pulsar (el orden lo decide la respuesta).
function syncBusy(): void {
  editorImages.disabled = store.busy;
  editorSubmit.disabled = store.busy;
  editorWithdraw.disabled = store.busy;
  for (const button of editorList.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
    const position = Number(button.dataset['position']);
    const total = store.chapter?.panels.length ?? 0;
    const action = button.dataset['action'];
    button.disabled = store.busy || (action === 'up' && position === 1) || (action === 'down' && position === total);
  }
}

// Al empezar una operación se recuerda el control con el foco: si se desactiva, el navegador lo deja en <body>, así
// que al terminar se le devuelve (si sigue en la página y activo; mover y eliminar lo colocan ellos después).
let focusBeforeBusy: HTMLElement | null = null;

function setBusy(busy: boolean): void {
  if (busy) focusBeforeBusy = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  store.busy = busy;
  syncBusy();
  if (!busy && focusBeforeBusy?.isConnected && !focusBeforeBusy.matches(':disabled') && (document.activeElement === document.body || document.activeElement === null)) {
    focusBeforeBusy.focus();
  }
  if (!busy) focusBeforeBusy = null;
}

async function loadChapter(slug: string, number: number): Promise<boolean> {
  const request = ++store.chapterRequest;
  const result = await api.get<{ chapter: AuthorChapterDto }>(chapterUrl(slug, number));
  if (request !== store.chapterRequest) return false;
  if (!result.ok) {
    store.chapter = null;
    editorTitle.textContent = `Capítulo ${number}`;
    editorBadge.textContent = '';
    editorBody.hidden = true;
    editorMessage.textContent = result.status === 404 ? 'Este capítulo no existe o se ha retirado.' : `No se pudo cargar el capítulo. ${errorText(result)}`;
    return false;
  }
  store.chapter = result.data.chapter;
  editorMessage.textContent = '';
  renderEditor();
  return true;
}

// Foco tras mover una viñeta: el mismo botón en su nueva fila o, si quedó desactivado (primera o última), el otro.
function focusPanelButton(position: number, preferred: 'up' | 'down'): void {
  const buttons = (action: string) => editorList.querySelector<HTMLButtonElement>(`button[data-action="${action}"][data-position="${position}"]`);
  const target = buttons(preferred);
  (target && !target.disabled ? target : buttons(preferred === 'up' ? 'down' : 'up'))?.focus();
}

editorList.addEventListener('click', async (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-action]');
  const chapter = store.chapter;
  const slug = currentSlug();
  if (!button || !chapter || !slug || store.busy) return;
  const position = Number(button.dataset['position']);
  const action = button.dataset['action'];
  const panelUrl = `${chapterUrl(slug, chapter.number)}/panels/${position}`;

  if (action === 'up' || action === 'down') {
    const to = action === 'up' ? position - 1 : position + 1;
    setBusy(true);
    const result = await api.patch<{ chapter: AuthorChapterDto }>(panelUrl, { position: to });
    setBusy(false);
    if (!result.ok) {
      say(editorStatus, `No se pudo mover la viñeta ${position}. ${errorText(result)}`, true);
      return;
    }
    store.chapter = result.data.chapter;
    renderEditor();
    say(editorStatus, `Viñeta ${position} movida a la posición ${to}.`);
    focusPanelButton(to, action);
    return;
  }

  if (action === 'remove') {
    if (!confirm(`¿Eliminar la viñeta ${position}? Se borra definitivamente.`)) return;
    setBusy(true);
    const result = await api.delete<void>(panelUrl);
    if (!result.ok) {
      setBusy(false);
      say(editorStatus, `No se pudo eliminar la viñeta ${position}. ${errorText(result)}`, true);
      return;
    }
    await loadChapter(slug, chapter.number);
    setBusy(false);
    say(editorStatus, `Viñeta ${position} eliminada.`);
    const remaining = store.chapter?.panels.length ?? 0;
    if (remaining === 0) editorImages.focus();
    else focusPanelButton(Math.min(position, remaining), 'up');
    void reloadComics();
  }
});

// CU-29 y choque 3: cada imagen se sube al elegirla, una petición por imagen y en el orden elegido.
editorImages.addEventListener('change', async () => {
  const files = [...(editorImages.files ?? [])];
  const chapter = store.chapter;
  const slug = currentSlug();
  if (files.length === 0 || !chapter || !slug) return;
  setBusy(true);
  const problems: string[] = [];
  let uploaded = 0;
  for (const [index, file] of files.entries()) {
    if (chapter.panels.length >= MAX_PANELS_PER_CHAPTER) {
      problems.push(`El capítulo ya tiene ${MAX_PANELS_PER_CHAPTER} viñetas, el máximo.`);
      break;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      problems.push(`${file.name}: pasa de 5 MB.`);
      continue;
    }
    say(editorStatus, `Subiendo ${index + 1} de ${files.length}: ${file.name}…`);
    const result = await api.post<{ panel: AuthorPanelDto }>(`${chapterUrl(slug, chapter.number)}/panels`, imageForm(file));
    if (!result.ok) {
      problems.push(`${file.name}: ${errorText(result)}`);
      // Límite de subidas, capítulo que ya no es borrador u obra que ya no se gestiona: no tiene sentido seguir.
      if (!['UNSUPPORTED_FILE', 'FILE_TOO_LARGE', 'VALIDATION_ERROR'].includes(result.error.code)) break;
      continue;
    }
    chapter.panels.push(result.data.panel);
    chapter.panelCount = chapter.panels.length;
    uploaded++;
    renderEditor();
  }
  editorImages.value = '';
  setBusy(false);
  const summary = uploaded === 0 ? 'No se ha subido ninguna imagen.' : `${plural(uploaded, 'imagen subida', 'imágenes subidas')}.`;
  say(editorStatus, [summary, ...problems].join(' '), problems.length > 0);
  void reloadComics();
});

editorSubmit.addEventListener('click', async () => {
  const chapter = store.chapter;
  const slug = currentSlug();
  if (!chapter || !slug) return;
  setBusy(true);
  const result = await api.post<{ chapter: AuthorChapterDto }>(`${chapterUrl(slug, chapter.number)}/submit`);
  setBusy(false);
  if (!result.ok) {
    say(editorStatus, errorText(result), true);
    return;
  }
  store.chapter = result.data.chapter;
  renderEditor();
  say(editorStatus, 'Capítulo enviado a revisión: ya no se puede editar.');
  focusHeading('capitulo-title'); // el botón ha desaparecido: el foco no se queda en el vacío
  void reloadComics();
});

editorWithdraw.addEventListener('click', () => {
  const comic = currentComic();
  if (comic && store.chapter) void withdrawChapter(comic, store.chapter.number);
});

// --- Ruta: ?obra=&capitulo= ---

interface RouteOptions {
  focus?: boolean; // lleva el foco al título de la sección abierta (tras crear o al llegar con su ancla)
  comicMessage?: string;
  comicMessageIsError?: boolean; // la obra se creó, pero su portada no se pudo subir
  chapterMessage?: string;
}

async function route(options: RouteOptions = {}): Promise<void> {
  const params = new URLSearchParams(location.search);
  const slug = params.get('obra');
  const rawNumber = params.get('capitulo');
  const number = rawNumber !== null && /^[1-9]\d{0,9}$/.test(rawNumber) ? Number(rawNumber) : null;
  say(comicFeedback, options.comicMessage ?? '', options.comicMessageIsError);
  say(editorStatus, options.chapterMessage ?? '');
  renderComic();

  const showChapter = slug !== null && rawNumber !== null && currentComic() !== null;
  chapterSection.hidden = !showChapter;
  document.querySelector<HTMLElement>('[data-nav="chapter"]')!.hidden = !showChapter;
  store.chapter = null;
  if (showChapter) {
    if (number === null) {
      store.chapterRequest++;
      editorTitle.textContent = 'Capítulo no encontrado';
      editorBadge.textContent = '';
      editorBody.hidden = true;
      editorMessage.textContent = 'Este capítulo no existe o se ha retirado.';
    } else {
      editorBody.hidden = true;
      await loadChapter(slug, number);
    }
  }
  if (options.focus) focusHeading(showChapter ? 'capitulo-title' : slug !== null ? 'obra-title' : 'mis-obras-title');
}

window.addEventListener('popstate', () => void route());

// --- Arranque ---

// Sin JS, los botones de envío llegan desactivados (no hay a dónde enviar un formulario): aquí se activan.
for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-needs-js]')) button.disabled = false;

const [tagsResult, loaded] = await Promise.all([api.get<{ tags: TagDto[] }>('/api/tags'), reloadComics()]);
if (tagsResult.ok) {
  store.tags = tagsResult.data.tags;
  renderTags();
} else {
  tagChoices.textContent = `No se pudieron cargar las etiquetas. ${errorText(tagsResult)}`;
}
if (loaded) await route({ focus: location.hash === '#obra' || location.hash === '#capitulo' });
