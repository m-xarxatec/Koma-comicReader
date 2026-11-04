import { api } from '../services/api.js';
import { getMe } from '../services/auth.js';
import { bindForm, COMMENT_BODY_MAX, commentProblem, textLength } from '../utils/validate.js';

// Comentarios por viñeta (CU-05, CU-13; RN-11) y compartir viñeta (CU-06) en el lector. El HTML del <dialog>
// viene en pages/reader.html; aquí se le da comportamiento. Todo texto de usuario va con textContent.
// Las funciones exportadas sin DOM (etiquetas, enlace y compartir) las prueba server/src/tests/unit/reader.test.ts.

export interface CommentDto {
  id: number;
  body: string;
  authorName: string;
  createdAt: string;
  mine: boolean;
}

interface CommentsPageDto {
  comments: CommentDto[];
  page: number;
  pageSize: number;
  total: number;
}

// --- Sin DOM ---

// aria-label del icono de cada viñeta (el número visible no basta para un lector de pantalla).
export function commentButtonLabel(position: number, count: number): string {
  if (count === 0) return `Comentar la viñeta ${position}: aún no tiene comentarios`;
  return `Ver ${count === 1 ? '1 comentario' : `${count} comentarios`} de la viñeta ${position}`;
}

// RN-09: enlace profundo absoluto a la viñeta.
export function panelShareUrl(origin: string, slug: string, number: number, position: number): string {
  return `${origin}/leer/${slug}/${number}#v-${position}`;
}

// Antes de ir al login se guarda el fragmento #v-n (CLAUDE.md): auth.ts vuelve a `next` con él.
export function loginHref(slug: string, number: number, position: number): string {
  return `/entrar?${new URLSearchParams({ next: `/leer/${slug}/${number}#v-${position}` }).toString()}`;
}

export type ShareOutcome = 'shared' | 'cancelled' | 'manual';

interface ShareNavigator {
  share?: (data: { title: string; url: string }) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
}

// CU-06: menú nativo si existe (solo en contexto seguro). Si el usuario lo cancela, no se muestra nada; si no
// existe o falla, el enlace a mano.
export async function sharePanel(nav: ShareNavigator, data: { title: string; url: string }): Promise<ShareOutcome> {
  if (typeof nav.share !== 'function') return 'manual';
  try {
    await nav.share(data);
    return 'shared';
  } catch (err) {
    return (err as { name?: unknown } | null)?.name === 'AbortError' ? 'cancelled' : 'manual';
  }
}

// "Copiar enlace" solo si el portapapeles existe (en http fuera de localhost no existe).
export const canCopy = (nav: ShareNavigator): boolean => typeof nav.clipboard?.writeText === 'function';

// --- Con DOM ---

export interface CommentPanelOptions {
  slug: string;
  number: number;
  comicTitle: string;
  onCountChange: (position: number, count: number) => void;
}

export interface CommentPanel {
  open: (position: number, count: number) => void;
}

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

export function createCommentPanel(options: CommentPanelOptions): CommentPanel | null {
  const dialog = byId<HTMLDialogElement>('comments-dialog');
  const title = byId<HTMLElement>('comments-title');
  const list = byId<HTMLUListElement>('comments-list');
  const statusLine = byId<HTMLElement>('comments-status');
  const more = byId<HTMLButtonElement>('comments-more');
  const form = byId<HTMLFormElement>('comment-form');
  const textarea = byId<HTMLTextAreaElement>('comment-body');
  const counter = byId<HTMLOutputElement>('comment-body-count');
  const signIn = byId<HTMLElement>('comments-signin');
  const signInLink = byId<HTMLAnchorElement>('comments-signin-link');
  const shareButton = byId<HTMLButtonElement>('share-panel');
  const fallback = byId<HTMLElement>('share-fallback');
  const shareInput = byId<HTMLInputElement>('share-link');
  const copyButton = byId<HTMLButtonElement>('share-copy');
  const feedback = byId<HTMLElement>('share-feedback');
  if (!dialog || !title || !list || !statusLine || !more || !form || !textarea || !counter || !signIn || !signInLink) return null;
  if (!shareButton || !fallback || !shareInput || !copyButton || !feedback) return null;

  const store = {
    position: 0,
    count: 0,
    page: 0,
    total: 0,
    request: 0, // la última carga pedida: una respuesta de una carga anterior (otra viñeta) se descarta
    signedIn: null as boolean | null, // se consulta /api/me la primera vez que se abre
  };
  const commentsPath = () => `/api/comics/${options.slug}/chapters/${options.number}/panels/${store.position}/comments`;

  function setCount(count: number): void {
    store.count = Math.max(0, count);
    options.onCountChange(store.position, store.count);
  }

  function updateCounter(): void {
    const length = textLength(textarea!.value, true);
    counter!.value = `${length} / ${COMMENT_BODY_MAX}`;
    counter!.classList.toggle('comments-dialog__count--over', length > COMMENT_BODY_MAX);
  }

  function emptyItem(): HTMLLIElement {
    const empty = document.createElement('li');
    empty.className = 'comments-dialog__empty';
    empty.textContent = 'Todavía no hay comentarios en esta viñeta.';
    return empty;
  }

  function commentItem(comment: CommentDto): HTMLLIElement {
    const item = document.createElement('li');
    item.className = 'comments-dialog__item';
    const author = document.createElement('strong');
    author.className = 'comments-dialog__author';
    author.textContent = comment.authorName;
    const time = document.createElement('time');
    time.className = 'comments-dialog__time';
    time.dateTime = comment.createdAt;
    time.textContent = dateFormat.format(new Date(comment.createdAt));
    const body = document.createElement('p');
    body.className = 'comments-dialog__text';
    body.textContent = comment.body; // texto plano (RN-11): los saltos de línea los respeta white-space
    item.append(author, ' ', time, body);
    if (comment.mine) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'comments-dialog__delete';
      remove.textContent = 'Eliminar mi comentario';
      remove.addEventListener('click', () => { void removeComment(comment, item, remove); });
      item.append(remove);
    }
    return item;
  }

  function showStatus(message: string): void {
    statusLine!.textContent = message;
  }

  function syncEmpty(): void {
    const items = list!.querySelectorAll('.comments-dialog__item').length;
    const empty = list!.querySelector('.comments-dialog__empty');
    if (items === 0 && !empty) list!.append(emptyItem());
    if (items > 0) empty?.remove();
  }

  async function loadPage(page: number): Promise<void> {
    const request = ++store.request;
    more!.disabled = true;
    if (page === 1) showStatus('Cargando comentarios...');
    const result = await api.get<CommentsPageDto>(`${commentsPath()}?page=${page}`);
    if (request !== store.request) return; // se abrió otra viñeta (o se recargó la lista) mientras tanto
    more!.disabled = false;
    if (!result.ok) {
      showStatus(result.error.message);
      return;
    }
    const { comments, total, pageSize } = result.data;
    store.page = page;
    store.total = total;
    if (page === 1) list!.replaceChildren();
    list!.append(...comments.map(commentItem));
    syncEmpty();
    more!.hidden = page * pageSize >= total;
    showStatus(page === 1 ? '' : `${comments.length === 1 ? '1 comentario más' : `${comments.length} comentarios más`}.`);
    if (page === 1 && total !== store.count) setCount(total); // el contador de la tira se había quedado viejo
  }

  async function removeComment(comment: CommentDto, item: HTMLLIElement, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    const result = await api.delete<void>(`/api/comments/${comment.id}`);
    // 409: ya estaba eliminado (otra pestaña); se quita igual.
    if (result.ok || result.status === 409 || result.status === 404) {
      const morePages = !more!.hidden;
      item.remove();
      syncEmpty();
      setCount(store.count - 1);
      // Con páginas sin cargar, el desplazamiento cambió: "Ver más" se saltaría uno. Se vuelve a la página 1.
      if (morePages) await loadPage(1);
      showStatus('Comentario eliminado.');
      textarea!.focus();
      return;
    }
    button.disabled = false;
    showStatus(result.error.message);
  }

  async function ensureSession(): Promise<boolean> {
    if (store.signedIn === null) {
      const me = await getMe();
      store.signedIn = me.ok && me.data.user !== null;
    }
    return store.signedIn;
  }

  async function syncForm(): Promise<void> {
    const signedIn = await ensureSession();
    form!.hidden = !signedIn;
    signIn!.hidden = signedIn;
    signInLink!.href = loginHref(options.slug, options.number, store.position);
  }

  bindForm(form, { body: commentProblem }, async ({ body = '' }) => {
    const result = await api.post<{ comment: CommentDto }>(commentsPath(), { body });
    if (!result.ok) {
      // La sesión caducó desde que se abrió el panel.
      if (result.status === 401) {
        store.signedIn = false;
        void syncForm();
      }
      return { ok: false, message: result.error.message, ...(result.error.fields && { fields: result.error.fields }) };
    }
    // Orden cronológico (D4): con páginas sin cargar, el nuevo va al final de la última; no se pinta aquí
    // (saldría en mitad de la lista y, al llegar a esa página, duplicado).
    const morePages = !more!.hidden;
    if (!morePages) {
      list!.append(commentItem(result.data.comment));
      syncEmpty();
    }
    setCount(store.count + 1);
    textarea!.value = '';
    updateCounter();
    showStatus(morePages ? 'Comentario publicado: lo verás al final de la lista.' : 'Comentario publicado.');
    textarea!.focus(); // el botón estaba desactivado durante el envío: el foco no se pierde en <body>
    return { ok: true };
  });
  textarea.addEventListener('input', updateCounter);

  more.addEventListener('click', () => { void loadPage(store.page + 1); });
  dialog.querySelector<HTMLButtonElement>('[data-close-comments]')?.addEventListener('click', () => dialog.close());
  // Un clic en el fondo (fuera de la hoja) también cierra, solo si empezó ahí: arrastrar una selección desde el
  // textarea hasta el fondo no debe cerrar el panel y perder el borrador.
  let pressedOnBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => { pressedOnBackdrop = event.target === dialog; });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && pressedOnBackdrop) dialog.close();
    pressedOnBackdrop = false;
  });

  // --- Compartir (CU-06) ---

  shareButton.addEventListener('click', async () => {
    const url = panelShareUrl(location.origin, options.slug, options.number, store.position);
    feedback.textContent = '';
    const outcome = await sharePanel(navigator, { title: `${options.comicTitle} · Capítulo ${options.number} · Viñeta ${store.position}`, url });
    if (outcome === 'shared') {
      feedback.textContent = 'Enlace enviado al menú para compartir.';
      return;
    }
    if (outcome === 'cancelled') return;
    shareInput.value = url;
    fallback.hidden = false;
    copyButton.hidden = !canCopy(navigator);
    shareInput.focus();
    shareInput.select();
    feedback.textContent = copyButton.hidden ? 'Selecciona el enlace y cópialo.' : 'Puedes copiar el enlace a esta viñeta.';
  });

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareInput.value);
      feedback.textContent = 'Enlace copiado.';
    } catch {
      shareInput.focus();
      shareInput.select();
      feedback.textContent = 'No se pudo copiar: selecciona el enlace y cópialo.';
    }
  });

  return {
    open(position, count) {
      store.position = position;
      store.count = count;
      store.page = 0;
      title.textContent = `Comentarios · Viñeta ${position}`;
      list.replaceChildren();
      more.hidden = true;
      textarea.value = '';
      textarea.removeAttribute('aria-invalid');
      for (const error of form.querySelectorAll<HTMLElement>('.form__error')) {
        error.textContent = '';
        error.hidden = true;
      }
      updateCounter();
      fallback.hidden = true;
      feedback.textContent = '';
      showStatus('');
      dialog.showModal();
      void syncForm();
      void loadPage(1);
    },
  };
}
