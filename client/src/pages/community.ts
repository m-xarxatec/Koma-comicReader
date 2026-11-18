import { confirmAction, confirmDialogParts } from '../components/confirm-dialog.js';
import type { ApiError } from '../services/api.js';
import { getMe, type UserDto } from '../services/auth.js';
import {
  getBoard,
  getOwnIllustrations,
  publishIllustration,
  withdrawIllustration,
  type IllustrationDto,
  type OwnIllustrationDto,
  type TagCountDto,
} from '../services/illustrations.js';
import {
  boardQueryString,
  illustrationDescriptionProblem,
  illustrationTagsProblem,
  illustrationTitleProblem,
  imageProblem,
  pageCount,
  paginationView,
  readBoardState,
  type BoardState,
} from '../utils/illustrations.js';
import { bindForm, failureOutcome } from '../utils/validate.js';

// /comunidad (CU-18 sin reto; contrato del bloque 6, «Comunidad» y «Páginas»; RN-22).
// - Tablero público en columnas, con filtro por etiqueta y páginas: su estado vive en la URL (enlaces normales).
// - Detalle en un <dialog> (D8).
// - Con sesión: formulario de publicación y «Mis ilustraciones» (D7); el admin no publica (D4).
// Todo dato de usuario se pinta con textContent; las imágenes llevan la URL firmada que da la API.

const store = {
  board: readBoardState(new URLSearchParams(location.search)),
  minePage: 1,
  user: null as UserDto | null,
};

const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' });
const formatDate = (iso: string) => dateFormat.format(new Date(iso));

const find = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector);

function errorText(error: ApiError): string {
  return error.requestId ? `${error.message} (código de referencia: ${error.requestId})` : error.message;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// width y height reservan el hueco antes de que llegue la imagen. alt vacío: en el tablero y en «Mis ilustraciones»
// el título ya está junto a la miniatura, y el lector de pantalla lo repetiría.
function picture(illustration: Pick<IllustrationDto, 'url' | 'width' | 'height'>, className: string, lazy: boolean): HTMLImageElement {
  const image = element('img', className);
  image.width = illustration.width;
  image.height = illustration.height;
  image.alt = '';
  if (lazy) image.loading = 'lazy';
  image.src = illustration.url;
  return image;
}

// --- Paginación (misma forma que la del catálogo) ---

function pageControl(label: string, available: boolean, target: string | (() => void)): HTMLElement {
  if (!available) return element('span', 'button button--outline catalog-pagination__disabled', label);
  if (typeof target === 'string') {
    const link = element('a', 'button button--outline', label);
    link.href = target;
    return link;
  }
  const button = element('button', 'button button--outline', label);
  button.type = 'button';
  button.addEventListener('click', target);
  return button;
}

function renderPagination(nav: HTMLElement | null, page: number, pages: number, target: (page: number) => string | (() => void)): void {
  if (!nav) return;
  nav.replaceChildren();
  const view = paginationView(page, pages);
  nav.hidden = view.kind === 'hidden';
  if (view.kind === 'hidden') return;
  // Más allá de la última página (un enlace antiguo, o sin resultados): solo la vuelta atrás, siempre activa.
  if (view.kind === 'back') {
    nav.append(pageControl('Anterior', true, target(view.to)));
    return;
  }
  nav.append(
    pageControl('Anterior', page > 1, target(page - 1)),
    element('span', 'catalog-pagination__current', `Página ${page} de ${pages}`),
    pageControl('Siguiente', page < pages, target(page + 1)),
  );
}

// --- Detalle (D8) ---

const detail = find<HTMLDialogElement>('#illustration-detail');

function openDetail(illustration: IllustrationDto): void {
  if (!detail) return;
  const title = detail.querySelector<HTMLElement>('#illustration-detail-title');
  const image = detail.querySelector<HTMLImageElement>('[data-detail-image]');
  const meta = detail.querySelector<HTMLElement>('[data-detail-meta]');
  const description = detail.querySelector<HTMLElement>('[data-detail-description]');
  const tags = detail.querySelector<HTMLElement>('[data-detail-tags]');
  if (title) title.textContent = illustration.title;
  if (image) {
    image.width = illustration.width;
    image.height = illustration.height;
    image.alt = illustration.title;
    image.src = illustration.url;
  }
  if (meta) meta.textContent = `De ${illustration.author.displayName} · ${formatDate(illustration.publishedAt)}`;
  if (description) {
    description.textContent = illustration.description ?? '';
    description.hidden = illustration.description === null;
  }
  if (tags) {
    tags.replaceChildren(
      ...illustration.tags.map((tag) => {
        const item = document.createElement('li');
        item.append(tagLink(tag, `#${tag}`, false));
        return item;
      }),
    );
    tags.hidden = illustration.tags.length === 0;
  }
  detail.showModal();
}

// Al cerrar se suelta la imagen: no sigue descargándose ni queda la anterior al abrir otra.
detail?.addEventListener('close', () => detail.querySelector<HTMLImageElement>('[data-detail-image]')?.removeAttribute('src'));
// Un clic en el fondo (fuera de la caja) cierra el detalle. El fondo y el relleno de la caja tienen el mismo target
// (el propio <dialog>), así que se mira si el punto cae fuera del rectángulo. Con teclado (Enter o Espacio en un
// botón) el clic llega sin coordenadas: no cuenta.
detail?.addEventListener('click', (event) => {
  if (event.target !== detail || (event.clientX === 0 && event.clientY === 0)) return;
  const box = detail.getBoundingClientRect();
  const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  if (outside) detail.close();
});

// --- Tablero ---

const boardLink = (state: BoardState) => `/comunidad${boardQueryString(state)}#tablero`;

function tagLink(tag: string, text: string, current: boolean): HTMLAnchorElement {
  const link = element('a', current ? 'tag-filter__link tag-filter__link--active' : 'tag-filter__link', text);
  link.href = boardLink({ tag, page: 1 });
  if (current) link.setAttribute('aria-current', 'true');
  return link;
}

function renderTags(tags: readonly TagCountDto[]): void {
  const nav = find('[data-board-tags]');
  if (!nav) return;
  nav.replaceChildren();
  // La etiqueta del filtro siempre aparece, aunque no esté entre las más usadas.
  const shown = store.board.tag && !tags.some((item) => item.tag === store.board.tag) ? [{ tag: store.board.tag, count: 0 }, ...tags] : tags;
  nav.hidden = shown.length === 0;
  if (nav.hidden) return;
  const all = element('a', store.board.tag ? 'tag-filter__link' : 'tag-filter__link tag-filter__link--active', 'Todas');
  all.href = boardLink({ tag: null, page: 1 });
  if (!store.board.tag) all.setAttribute('aria-current', 'true');
  nav.append(all);
  for (const { tag, count } of shown) {
    nav.append(tagLink(tag, count > 0 ? `#${tag} (${count})` : `#${tag}`, tag === store.board.tag));
  }
}

function boardTile(illustration: IllustrationDto): HTMLLIElement {
  const item = element('li', 'illustration-board__item');
  const button = element('button', 'illustration-tile');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  const caption = element('span', 'illustration-tile__caption');
  caption.append(
    element('strong', 'illustration-tile__title', illustration.title),
    element('span', 'illustration-tile__author', `De ${illustration.author.displayName}`),
  );
  button.append(picture(illustration, 'illustration-tile__image', true), caption);
  button.addEventListener('click', () => openDetail(illustration));
  item.append(button);
  return item;
}

async function loadBoard(): Promise<void> {
  const list = find('[data-board-list]');
  const message = find('[data-board-message]');
  const status = find('[data-board-status]');
  if (!list || !message) return;
  // Se muestra siempre al empezar: tras una carga correcta quedó oculto, y un error de la siguiente (al retirar una
  // ilustración publicada) se escribiría en un párrafo oculto.
  message.hidden = false;
  message.textContent = 'Cargando las ilustraciones…';
  const result = await getBoard(store.board);
  if (!result.ok) {
    list.replaceChildren();
    message.textContent = errorText(result.error);
    return;
  }
  const { illustrations, tags, total, pageSize } = result.data;
  renderTags(tags);
  list.replaceChildren(...illustrations.map(boardTile));
  const filter = store.board.tag ? ` con la etiqueta #${store.board.tag}` : '';
  if (illustrations.length === 0) {
    message.textContent =
      total > 0 ? 'Esta página no tiene ilustraciones.' : store.board.tag ? `Todavía no hay ilustraciones${filter}.` : 'Todavía no hay ilustraciones. ¡Comparte la primera!';
  } else {
    message.textContent = '';
  }
  message.hidden = message.textContent === '';
  if (status) status.textContent = total === 1 ? `1 ilustración${filter}.` : `${total} ilustraciones${filter}.`;
  renderPagination(find('[data-board-pagination]'), store.board.page, pageCount(total, pageSize), (page) => boardLink({ ...store.board, page }));
}

// --- Mis ilustraciones (D7) ---

const STATUS: Readonly<Record<OwnIllustrationDto['status'], { text: string; modifier: string }>> = {
  pending: { text: 'Pendiente de revisión', modifier: 'status-badge--warning' },
  approved: { text: 'Publicada', modifier: 'status-badge--success' },
  rejected: { text: 'Rechazada', modifier: 'status-badge--danger' },
};

const mineStatus = find('[data-mine-status]');
const mineTitle = find('#mine-title');
const dialogParts = confirmDialogParts();

function setStatus(region: HTMLElement | null, text: string, isError = false): void {
  if (!region) return;
  region.textContent = text;
  region.classList.toggle('form__status--error', isError);
}

// Repintar la lista hace desaparecer el botón que tenía el foco: se lleva al título de la sección.
const focusMine = () => mineTitle?.focus();

async function withdraw(illustration: OwnIllustrationDto, button: HTMLButtonElement): Promise<void> {
  // El diálogo común (components/confirm-dialog.ts, D2); sin sus piezas no se retira nada.
  const confirmed = await confirmAction(dialogParts, {
    title: '¿Retirar la ilustración?',
    text: `«${illustration.title}» dejará de verse y no se podrá recuperar.`,
    confirm: 'Retirar',
    danger: true,
  });
  if (!confirmed) return;
  button.disabled = true;
  setStatus(mineStatus, '');
  const result = await withdrawIllustration(illustration.id);
  // 409: ya estaba retirada (otra pestaña): la lista se recarga igual.
  if (!result.ok && result.status !== 409) {
    setStatus(mineStatus, errorText(result.error), true);
    button.disabled = false;
    return;
  }
  setStatus(mineStatus, `«${illustration.title}» se ha retirado.`);
  await loadMine();
  focusMine();
  // Siempre: la fila se pintó con el estado de entonces, y el admin pudo aprobarla después (ya estaría en el tablero).
  await loadBoard();
}

function ownItem(illustration: OwnIllustrationDto): HTMLLIElement {
  const item = element('li', 'own-illustration');
  const body = element('div', 'own-illustration__body');
  const state = STATUS[illustration.status];
  const date =
    illustration.status === 'approved' && illustration.publishedAt
      ? `Publicada el ${formatDate(illustration.publishedAt)}`
      : `Enviada el ${formatDate(illustration.createdAt)}`;
  body.append(
    element('h3', 'own-illustration__title', illustration.title),
    element('span', `status-badge ${state.modifier}`, state.text),
    element('p', 'own-illustration__meta', date),
  );
  if (illustration.status === 'rejected' && illustration.rejectionReason) {
    body.append(element('p', 'own-illustration__reason', `Motivo: ${illustration.rejectionReason}`));
  }
  const button = element('button', 'button button--outline button--danger own-illustration__withdraw', 'Retirar');
  button.type = 'button';
  button.setAttribute('aria-label', `Retirar «${illustration.title}»`);
  button.addEventListener('click', () => void withdraw(illustration, button));
  body.append(button);
  item.append(picture(illustration, 'own-illustration__image', true), body);
  return item;
}

async function loadMine(): Promise<void> {
  const section = find('#mis-ilustraciones');
  const list = find('[data-mine-list]');
  const message = find('[data-mine-message]');
  if (!section || !list || !message) return;
  const result = await getOwnIllustrations(store.minePage);
  if (!result.ok) {
    // 401: la sesión ha caducado; la sección deja de tener sentido.
    section.hidden = result.status === 401;
    list.replaceChildren();
    message.textContent = errorText(result.error);
    message.hidden = false;
    return;
  }
  const { illustrations, total, pageSize } = result.data;
  const pages = pageCount(total, pageSize);
  // La última página se vació al retirar: se vuelve a la anterior.
  if (illustrations.length === 0 && total > 0 && store.minePage > pages) {
    store.minePage = pages;
    await loadMine();
    return;
  }
  section.hidden = false;
  list.replaceChildren(...illustrations.map(ownItem));
  message.textContent = total === 0 ? 'Todavía no has compartido ninguna ilustración.' : '';
  message.hidden = total > 0;
  renderPagination(find('[data-mine-pagination]'), store.minePage, pages, (page) => async () => {
    store.minePage = page;
    await loadMine();
    focusMine();
  });
}

// --- Publicar (D2–D6) ---

function setUpShare(user: UserDto | null): void {
  const guest = find('[data-share-guest]');
  const admin = find('[data-share-admin]');
  const form = find<HTMLFormElement>('[data-share-form]');
  const status = find('[data-share-status]');
  const fileInput = find<HTMLInputElement>('#share-image');
  if (guest) guest.hidden = user !== null;
  if (admin) admin.hidden = user?.role !== 'admin';
  if (!form || !fileInput || !user || user.role === 'admin') return;

  form.hidden = false;
  const file = () => fileInput.files?.[0] ?? null;
  bindForm(
    form,
    {
      image: () => imageProblem(file()),
      title: illustrationTitleProblem,
      description: illustrationDescriptionProblem,
      tags: illustrationTagsProblem,
    },
    async (values) => {
      const image = file();
      if (!image) return { ok: false, message: 'Elige una imagen', fields: { image: 'Elige una imagen' } };
      setStatus(status, '');
      const result = await publishIllustration({
        image,
        title: values['title'] ?? '',
        description: values['description'] ?? '',
        tags: values['tags'] ?? '',
      });
      if (!result.ok) return failureOutcome(result.status, result.error);
      form.reset();
      setStatus(status, `«${result.data.illustration.title}» se ha enviado a revisión. La verás en el tablero cuando se apruebe.`);
      store.minePage = 1;
      await loadMine();
      return { ok: true };
    },
  );
  for (const button of form.querySelectorAll<HTMLButtonElement>('button[data-needs-js]')) button.disabled = false;
}

async function setUpSession(): Promise<void> {
  const me = await getMe();
  store.user = me.ok ? me.data.user : null;
  setUpShare(store.user);
  // El admin no publica (D4): no tiene «Mis ilustraciones».
  if (store.user && store.user.role !== 'admin') await loadMine();
}

void loadBoard();
void setUpSession();
