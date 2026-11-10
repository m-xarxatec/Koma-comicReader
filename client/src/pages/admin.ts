import {
  changeUser,
  deleteComment,
  getReviewQueue,
  getStats,
  getSettings,
  hideComment,
  listComments,
  listUsers,
  reviewChapter,
  reviewComic,
  saveSettings,
  searchAudit,
  type AdminCommentDto,
  type AdminStatsDto,
  type AdminUserChange,
  type AdminUserDto,
  type AuditEntryDto,
  type PageDto,
  type ReviewItemDto,
} from '../services/admin.js';
import type { ApiError, ApiResult } from '../services/api.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, auditEntityLabel, canApprove, lastPage, reasonProblem, settingProblem } from '../utils/admin.js';
import { bindForm, failureOutcome } from '../utils/validate.js';

// /admin (contratos de los bloques 4 y 5): estadísticas (CU-39), cola de aprobación, comentarios, usuarios, parámetros y auditoría. Cada sección pide
// su lista a /api/admin/*; los filtros van a la API. Todo dato se pinta con textContent. Lo que decide es el servidor:
// aquí solo se ocultan o desactivan botones (p. ej. los de la propia cuenta).

const dateTime = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });
const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

// --- Utilidades de DOM (sin innerHTML) ---

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function cell(...children: (Node | string)[]): HTMLTableCellElement {
  const td = el('td', 'chapter-table__cell');
  td.append(...children);
  return td;
}

function badge(text: string, tone: 'success' | 'warning' | 'danger' | '' = ''): HTMLSpanElement {
  return el('span', tone ? `status-badge status-badge--${tone}` : 'status-badge', text);
}

function actionButton(label: string, onClick: (button: HTMLButtonElement) => void, danger = false): HTMLButtonElement {
  const button = el('button', `button ${danger ? 'button--danger' : 'button--outline'}`, label);
  button.type = 'button';
  button.addEventListener('click', () => onClick(button));
  return button;
}

const errorText = (error: ApiError) => (error.requestId ? `${error.message} (código de referencia: ${error.requestId})` : error.message);

// Avisos de las acciones (role="status", al final de main). Se vacía antes de escribir para que se anuncie también
// un aviso igual al anterior (p. ej. dos "Comentario ocultado." seguidos).
const live = document.querySelector<HTMLElement>('[data-live]');
const announce = (message: string) => {
  if (!live) return;
  live.textContent = '';
  requestAnimationFrame(() => {
    live.textContent = message;
  });
};

// --- Diálogo de confirmación (y motivo del rechazo) ---

const dialog = document.querySelector<HTMLDialogElement>('#admin-dialog');
const dialogForm = document.querySelector<HTMLFormElement>('#admin-dialog-form');
const dialogTitle = document.querySelector<HTMLElement>('#admin-dialog-title');
const dialogText = document.querySelector<HTMLElement>('#admin-dialog-text');
const reasonField = document.querySelector<HTMLElement>('[data-reason-field]');
const reasonInput = document.querySelector<HTMLTextAreaElement>('#admin-reason');
const reasonError = document.querySelector<HTMLElement>('#admin-reason-error');
const confirmButton = document.querySelector<HTMLButtonElement>('[data-dialog-confirm]');

interface ConfirmOptions {
  title: string;
  text: string;
  confirm: string;
  danger?: boolean;
  withReason?: boolean;
}

const showReasonError = (problem: string | null) => {
  if (!reasonInput || !reasonError) return;
  reasonError.textContent = problem ?? '';
  reasonError.hidden = problem === null;
  if (problem === null) reasonInput.removeAttribute('aria-invalid');
  else reasonInput.setAttribute('aria-invalid', 'true');
};

// Resuelve con el motivo ('' si no se pide) o null si se cancela. La única salida es el evento close, sea cual sea
// la vía (Confirmar, Cancelar, Escape o un close() del navegador): solo cuenta como confirmación si returnValue es
// "confirm", el value del botón de envío de method="dialog". Los listeners de cada apertura cuelgan de un
// AbortController que se aborta al cerrar, así que ninguno sobrevive para resolver la acción de otra apertura. El
// foco vuelve al botón que lo abrió (lo hace el propio <dialog> al cerrarse).
function confirmAction(options: ConfirmOptions): Promise<string | null> {
  if (!dialog || !dialogForm || !dialogTitle || !dialogText || !reasonField || !reasonInput || !reasonError || !confirmButton) {
    return Promise.resolve(null);
  }
  if (dialog.open) return Promise.resolve(null);
  dialogTitle.textContent = options.title;
  dialogText.textContent = options.text;
  confirmButton.textContent = options.confirm;
  confirmButton.className = `button ${options.danger ? 'button--danger' : 'button--primary'}`;
  reasonField.hidden = !options.withReason;
  reasonInput.value = '';
  showReasonError(null);
  dialog.returnValue = '';

  return new Promise((resolve) => {
    const listeners = new AbortController();
    const { signal } = listeners;
    const cancel = dialog.querySelector<HTMLButtonElement>('[data-dialog-cancel]');
    // Con un motivo no válido se cancela el envío y el diálogo sigue abierto; si es válido, method="dialog" lo cierra.
    dialogForm.addEventListener(
      'submit',
      (event) => {
        if (!options.withReason) return;
        const problem = reasonProblem(reasonInput.value);
        if (problem === null) return;
        event.preventDefault();
        showReasonError(problem);
        reasonInput.focus();
      },
      { signal },
    );
    reasonInput.addEventListener('input', () => showReasonError(null), { signal });
    cancel?.addEventListener('click', () => dialog.close('cancel'), { signal });
    dialog.addEventListener(
      'close',
      () => {
        listeners.abort();
        if (dialog.returnValue !== 'confirm') resolve(null);
        else resolve(options.withReason ? reasonInput.value.trim() : '');
      },
      { signal },
    );
    dialog.showModal();
    (options.withReason ? reasonInput : cancel)?.focus();
  });
}

// Ejecuta una acción con el botón desactivado; anuncia el resultado y recarga su lista y la auditoría (donde aparece
// la entrada nueva). La recarga sustituye las filas (y con ellas el botón que tenía el foco): el foco pasa a la tabla
// de la sección o, si queda vacía, a su mensaje. Si la acción falla sin recargar, vuelve al botón.
async function run(
  button: HTMLButtonElement,
  request: () => Promise<ApiResult<unknown>>,
  success: string,
  view: ListView,
  reload: () => Promise<void>,
) {
  button.disabled = true;
  const result = await request();
  if (result.ok) {
    announce(success);
    await Promise.all([reload(), loadAudit()]);
    focusList(view);
    return;
  }
  announce(errorText(result.error));
  // Un 409, 410 o 404 significan que otro admin (u otra pestaña) cambió el estado: se recarga para verlo.
  if (result.status === 409 || result.status === 410 || result.status === 404) {
    await reload();
    focusList(view);
    return;
  }
  button.disabled = false;
  button.focus();
}

// --- Listas con mensaje, tabla y paginación ---

interface ListView {
  message: HTMLElement | null;
  table: HTMLElement | null;
  rows: HTMLElement | null;
  pager: HTMLElement | null;
  count: HTMLElement | null;
}

const listView = (name: string): ListView => ({
  message: document.querySelector<HTMLElement>(`[data-message="${name}"]`),
  table: document.querySelector<HTMLElement>(`[data-table="${name}"]`),
  rows: document.querySelector<HTMLElement>(`[data-rows="${name}"]`),
  pager: document.querySelector<HTMLElement>(`[data-pager="${name}"]`),
  count: document.querySelector<HTMLElement>(`[data-count="${name}"]`),
});

// La tabla (región desplazable con tabindex="0") si se ve; si no, el mensaje de la sección (tabindex="-1").
function focusList(view: ListView): void {
  const target = view.table && !view.table.hidden ? view.table : view.message;
  target?.focus();
}

function showRows(view: ListView, rows: HTMLTableRowElement[], empty: string, total = rows.length): void {
  view.rows?.replaceChildren(...rows);
  if (view.table) view.table.hidden = rows.length === 0;
  if (view.message) view.message.textContent = rows.length === 0 ? empty : '';
  if (view.count) view.count.textContent = `${total} ${total === 1 ? 'resultado' : 'resultados'}`;
}

function showError(view: ListView, error: ApiError): void {
  view.rows?.replaceChildren();
  if (view.table) view.table.hidden = true;
  if (view.message) view.message.textContent = errorText(error);
  if (view.pager) view.pager.hidden = true;
  if (view.count) view.count.textContent = '';
}

interface Paged {
  page: number;
  filters: Record<string, string>;
}

// Si la página pedida ya no existe (se vació la última tras una acción o cambió el total), la lista pasa a la última
// que existe y se vuelve a pedir: nunca «Página 3 de 2».
function pageOutOfRange(state: Paged, page: PageDto): boolean {
  const last = lastPage(page.total, page.pageSize);
  if (state.page <= last) return false;
  state.page = last;
  return true;
}

function updatePager(view: ListView, state: Paged, page: PageDto, load: () => Promise<void>): void {
  const pager = view.pager;
  if (!pager) return;
  const pages = lastPage(page.total, page.pageSize);
  pager.hidden = page.total <= page.pageSize;
  const label = pager.querySelector<HTMLElement>('[data-page="label"]');
  if (label) label.textContent = `Página ${page.page} de ${pages} · ${page.total} en total`;
  const prev = pager.querySelector<HTMLButtonElement>('[data-page="prev"]');
  const next = pager.querySelector<HTMLButtonElement>('[data-page="next"]');
  if (prev) {
    prev.disabled = page.page <= 1;
    prev.onclick = () => {
      state.page -= 1;
      void load();
    };
  }
  if (next) {
    next.disabled = page.page >= pages;
    next.onclick = () => {
      state.page += 1;
      void load();
    };
  }
}

// Filtros de una lista: al enviar, página 1 con los valores del formulario. Sin las burbujas del navegador (un
// correo a medias en «Actor» no bloquea el envío): el servidor valida y su 400 se muestra con sus fields en la
// sección. «Filtrar» llega desactivado (data-needs-js) y se activa aquí.
function bindFilters(name: string, state: Paged, load: () => Promise<void>): void {
  const form = document.querySelector<HTMLFormElement>(`[data-filters="${name}"]`);
  if (!form) return;
  form.noValidate = true;
  for (const button of form.querySelectorAll<HTMLButtonElement>('button[data-needs-js]')) button.disabled = false;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values: Record<string, string> = {};
    for (const [key, value] of new FormData(form)) if (typeof value === 'string') values[key] = value.trim();
    state.filters = values;
    state.page = 1;
    void load();
  });
}

// --- Aprobación (CU-32) ---

const reviewView = listView('review');
const pendingTotal = document.querySelector<HTMLElement>('[data-pending-total]');
const pendingNote = document.querySelector<HTMLElement>('[data-pending-note]');
const pendingBadge = document.querySelector<HTMLElement>('[data-pending-badge]');

function reviewRow(item: ReviewItemDto): HTMLTableRowElement {
  const row = el('tr');
  const { comic, chapter } = item;
  const what = el('span', 'admin-page__strong', comic.title);
  const detail = el(
    'span',
    'admin-page__small',
    chapter ? `Capítulo ${chapter.number} · ${chapter.title} · ${chapter.panelCount} viñetas` : 'Nueva obra',
  );
  const badges = el('span', 'admin-page__badges');
  if (comic.isAdult) badges.append(badge('+18: no se aprueba', 'danger'));
  if (comic.contentWarning) badges.append(badge('Con advertencia', 'warning'));
  if (chapter && comic.status === 'pending') badges.append(badge('Obra en revisión'));
  if (badges.childElementCount === 0) badges.append(el('span', 'admin-page__small', '—'));

  const preview = el('a', 'text-link', 'Vista previa');
  preview.href = chapter ? `/leer/${encodeURIComponent(comic.slug)}/${chapter.number}` : `/obra/${encodeURIComponent(comic.slug)}`;
  const label = chapter ? `el capítulo ${chapter.number} de «${comic.title}»` : `la obra «${comic.title}»`;
  const decide = (decision: 'approve' | 'reject', reason?: string) =>
    chapter ? reviewChapter(comic.slug, chapter.number, decision, reason) : reviewComic(comic.slug, decision, reason);

  const approve = actionButton('Aprobar', async (button) => {
    const ok = await confirmAction({ title: 'Aprobar', text: `Se publicará ${label}.`, confirm: 'Aprobar' });
    if (ok !== null) await run(button, () => decide('approve'), `Aprobado: ${label}.`, reviewView, loadReview);
  });
  const reject = actionButton(
    'Rechazar',
    async (button) => {
      const reason = await confirmAction({ title: 'Rechazar', text: `Rechazar ${label}.`, confirm: 'Rechazar', danger: true, withReason: true });
      if (reason !== null) await run(button, () => decide('reject', reason), `Rechazado: ${label}.`, reviewView, loadReview);
    },
    true,
  );
  const actions = el('div', 'chapter-table__actions');
  // RN-17: sin «Aprobar» en una obra +18 (el distintivo «+18: no se aprueba» lo explica).
  actions.append(...(canApprove(comic, chapter) ? [preview, approve, reject] : [preview, reject]));

  row.append(cell(what, detail), cell(comic.publishedBy), cell(formatDateTime(item.submittedAt)), cell(badges), cell(actions));
  return row;
}

async function loadReview(): Promise<void> {
  if (reviewView.count) reviewView.count.textContent = '';
  if (pendingBadge) pendingBadge.textContent = '';
  const result = await getReviewQueue();
  if (!result.ok) {
    if (pendingTotal) pendingTotal.textContent = '—';
    if (pendingNote) pendingNote.textContent = '';
    showError(reviewView, result.error);
    return;
  }
  const { items, counts } = result.data;
  const total = counts.comics + counts.chapters;
  if (pendingTotal) pendingTotal.textContent = String(total);
  if (pendingNote) pendingNote.textContent = `${counts.chapters} capítulos · ${counts.comics} obras`;
  if (pendingBadge) pendingBadge.textContent = total > 0 ? `${total} ${total === 1 ? 'pendiente' : 'pendientes'}` : '';
  showRows(reviewView, items.map(reviewRow), 'No hay nada pendiente de revisión.', total);
}

// --- Comentarios (CU-33) ---

const commentsView = listView('comments');
const commentsState: Paged = { page: 1, filters: {} };

function commentRow(comment: AdminCommentDto): HTMLTableRowElement {
  const row = el('tr');
  const place = el('a', 'text-link', `${comment.comic.title} · Cap. ${comment.chapterNumber} · Viñeta ${comment.panelPosition}`);
  place.href = `/leer/${encodeURIComponent(comment.comic.slug)}/${comment.chapterNumber}#v-${comment.panelPosition}`;
  const state = comment.hiddenAt ? badge('Oculto', 'warning') : badge('Visible', 'success');
  const actions = el('div', 'chapter-table__actions');
  if (!comment.hiddenAt) {
    actions.append(
      actionButton('Ocultar', async (button) => {
        const ok = await confirmAction({
          title: 'Ocultar comentario',
          text: 'Nadie lo verá, tampoco quien lo escribió. En esta versión no se puede deshacer.',
          confirm: 'Ocultar',
          danger: true,
        });
        if (ok !== null) await run(button, () => hideComment(comment.id), 'Comentario ocultado.', commentsView, loadComments);
      }),
    );
  }
  actions.append(
    actionButton(
      'Eliminar',
      async (button) => {
        const ok = await confirmAction({ title: 'Eliminar comentario', text: 'Desaparece de esta lista y de la viñeta.', confirm: 'Eliminar', danger: true });
        if (ok !== null) await run(button, () => deleteComment(comment.id), 'Comentario eliminado.', commentsView, loadComments);
      },
      true,
    ),
  );
  row.append(
    cell(el('span', 'admin-page__comment', comment.body), el('span', 'admin-page__small', formatDateTime(comment.createdAt))),
    cell(comment.author.displayName),
    cell(place),
    cell(state),
    cell(actions),
  );
  return row;
}

async function loadComments(): Promise<void> {
  if (commentsView.count) commentsView.count.textContent = '';
  const result = await listComments({ ...commentsState.filters, page: commentsState.page });
  if (!result.ok) {
    showError(commentsView, result.error);
    return;
  }
  if (pageOutOfRange(commentsState, result.data)) return loadComments();
  showRows(commentsView, result.data.comments.map(commentRow), 'No hay comentarios con estos filtros.', result.data.total);
  updatePager(commentsView, commentsState, result.data, loadComments);
}

// --- Usuarios (CU-35) ---

const usersView = listView('users');
const usersState: Paged = { page: 1, filters: {} };

const roleLabel = (user: AdminUserDto) => (user.role === 'admin' ? 'Admin' : user.isAuthor ? 'Autor' : 'Lector');

function userRow(user: AdminUserDto): HTMLTableRowElement {
  const row = el('tr');
  const name = el('span', 'admin-page__strong', user.displayName);
  const email = el('span', 'admin-page__small', user.email);
  const plan = user.isPremium && user.premiumUntil ? `Premium hasta el ${dateOnly.format(new Date(user.premiumUntil))}` : 'Gratuito';
  const state = user.status === 'active' ? badge('Activo', 'success') : badge('Suspendido', 'danger');
  const actions = el('div', 'chapter-table__actions');

  const change = (label: string, text: string, payload: AdminUserChange, done: string, danger = false) =>
    actionButton(
      label,
      async (button) => {
        const ok = await confirmAction({ title: label, text: `${text} (${user.displayName}, ${user.email})`, confirm: label, danger });
        if (ok !== null) await run(button, () => changeUser(user.id, payload), done, usersView, loadUsers);
      },
      danger,
    );

  if (user.isSelf) {
    actions.append(el('span', 'admin-page__small', 'Tu cuenta: no puedes cambiar tu rol ni tu estado.'));
  } else {
    if (user.role === 'admin') {
      actions.append(change('Quitar admin', 'Dejará de ser admin y se cerrarán sus sesiones.', { role: 'user' }, 'Rol de admin quitado.', true));
    } else if (!user.isAuthor) {
      actions.append(change('Hacer admin', 'Tendrá acceso al panel de administración y se cerrarán sus sesiones.', { role: 'admin' }, 'Ahora es admin.'));
    }
    if (user.role === 'user') {
      actions.append(
        user.isAuthor
          ? change('Quitar autor', 'Sus obras siguen publicadas, pero ya no podrá gestionarlas.', { isAuthor: false }, 'Rol de autor quitado.', true)
          : change('Dar rol de autor', 'Podrá crear obras y subir capítulos.', { isAuthor: true }, 'Ahora es autor.'),
      );
    }
    actions.append(
      user.status === 'active'
        ? change('Suspender', 'No podrá entrar y se cerrarán sus sesiones; su contenido sigue visible.', { status: 'suspended' }, 'Cuenta suspendida.', true)
        : change('Reactivar', 'Podrá volver a entrar.', { status: 'active' }, 'Cuenta reactivada.'),
    );
  }
  row.append(cell(name, email), cell(roleLabel(user)), cell(plan), cell(state), cell(actions));
  return row;
}

async function loadUsers(): Promise<void> {
  if (usersView.count) usersView.count.textContent = '';
  const result = await listUsers({ ...usersState.filters, page: usersState.page });
  if (!result.ok) {
    showError(usersView, result.error);
    return;
  }
  if (pageOutOfRange(usersState, result.data)) return loadUsers();
  showRows(usersView, result.data.users.map(userRow), 'No hay usuarios con estos filtros.', result.data.total);
  updatePager(usersView, usersState, result.data, loadUsers);
}

// --- Parámetros (CU-36) ---

async function setUpSettings(): Promise<void> {
  const form = document.querySelector<HTMLFormElement>('#settings-form');
  if (!form) return;
  const status = form.querySelector<HTMLElement>('[data-form-status]');
  const formError = form.querySelector<HTMLElement>('[data-form-error]');
  const input = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);
  const result = await getSettings();
  if (!result.ok) {
    // Sin los valores actuales no se puede guardar: el fallo va en la caja de error del formulario (role="alert") y
    // el botón sigue desactivado.
    if (formError) {
      formError.textContent = errorText(result.error);
      formError.hidden = false;
    }
    return;
  }
  for (const [name, value] of Object.entries(result.data.settings)) {
    const field = input(name);
    if (field) field.value = String(value);
  }
  for (const button of form.querySelectorAll<HTMLButtonElement>('button[data-needs-js]')) button.disabled = false;
  form.addEventListener('input', () => {
    if (status) status.textContent = '';
  });
  bindForm(
    form,
    {
      waitMinutes: (value) => settingProblem('waitMinutes', value),
      maxBalance: (value) => settingProblem('maxBalance', value),
      refill: (value) => settingProblem('refill', value),
    },
    async (values) => {
      const saved = await saveSettings({
        waitMinutes: Number(values['waitMinutes']),
        maxBalance: Number(values['maxBalance']),
        refill: Number(values['refill']),
      });
      if (!saved.ok) return failureOutcome(saved.status, saved.error);
      if (status) status.textContent = 'Parámetros guardados: se aplican desde la siguiente lectura.';
      return { ok: true };
    },
  );
}

// --- Auditoría (CU-40) ---

const auditView = listView('audit');
const auditState: Paged = { page: 1, filters: {} };

function fillAuditFilters(): void {
  const action = document.querySelector<HTMLSelectElement>('#audit-action');
  for (const name of AUDIT_ACTIONS) action?.append(new Option(name, name));
  const entity = document.querySelector<HTMLSelectElement>('#audit-entity');
  for (const [value, label] of Object.entries(AUDIT_ENTITY_TYPES)) entity?.append(new Option(label, value));
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

function auditRow(entry: AuditEntryDto): HTMLTableRowElement {
  const row = el('tr');
  const actor = entry.actor
    ? [el('span', 'admin-page__strong', entry.actor.displayName), el('span', 'admin-page__small', entry.actor.email)]
    : [el('span', 'admin-page__strong', 'Sistema')];
  const entity = auditEntityLabel(entry.entityType, entry.entityId);
  const detail: Node[] = [];
  if (entry.before !== null || entry.after !== null) {
    const details = el('details');
    details.append(el('summary', 'admin-page__summary', 'Ver cambios'), el('pre', 'admin-page__json', `Antes: ${json(entry.before)}\nDespués: ${json(entry.after)}`));
    detail.push(details);
  } else {
    detail.push(el('span', 'admin-page__small', '—'));
  }
  if (entry.ip) detail.push(el('span', 'admin-page__small', `IP ${entry.ip}`));
  row.append(
    cell(formatDateTime(entry.createdAt)),
    cell(...actor),
    cell(el('code', 'admin-page__code', entry.action)),
    cell(entity),
    cell(...detail),
    cell(el('code', 'admin-page__code', entry.requestId)),
  );
  return row;
}

async function loadAudit(): Promise<void> {
  if (auditView.count) auditView.count.textContent = '';
  const result = await searchAudit({ ...auditState.filters, page: auditState.page });
  if (!result.ok) {
    // Un filtro no válido (400) llega con sus fields: se muestran todos en el mensaje.
    const fields = Object.values(result.error.fields ?? {});
    showError(auditView, fields.length > 0 ? { ...result.error, message: `${result.error.message}: ${fields.join(' ')}` } : result.error);
    return;
  }
  if (pageOutOfRange(auditState, result.data)) return loadAudit();
  showRows(auditView, result.data.entries.map(auditRow), 'No hay entradas con estos filtros.', result.data.total);
  updatePager(auditView, auditState, result.data, loadAudit);
}

// --- Estadísticas globales (CU-39; RN-20; contrato del bloque 5) ---

const numberFormat = new Intl.NumberFormat('es-ES');
// `today` es un día de Madrid (AAAA-MM-DD): se formatea en esa zona, a mediodía UTC para no cambiar de día.
const madridDay = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'Europe/Madrid' });
const statsMessage = document.querySelector<HTMLElement>('[data-message="stats"]');
const statsContent = document.querySelector<HTMLElement>('[data-stats]');
const topComicsRows = document.querySelector<HTMLElement>('[data-rows="top-comics"]');
const moderatedNote = document.querySelector<HTMLElement>('[data-moderated-note]');
const printButton = document.querySelector<HTMLButtonElement>('[data-print-stats]');

// Cada [data-stat] de la página (métricas y tablas) con su cifra. Lista cerrada: un data-stat sin entrada se queda en «—».
function statValues(stats: AdminStatsDto): Readonly<Record<string, number>> {
  return {
    'users.total': stats.users.total,
    'users.readers': stats.users.readers,
    'users.authors': stats.users.authors,
    'users.admins': stats.users.admins,
    'users.suspended': stats.users.suspended,
    'users.premium': stats.users.premium,
    'users.activeLast30': stats.users.activeLast30,
    'reads.total': stats.reads.total,
    'reads.last7': stats.reads.last7,
    'reads.last30': stats.reads.last30,
    'reads.guests.total': stats.reads.guests.total,
    'reads.guests.last7': stats.reads.guests.last7,
    'reads.guests.last30': stats.reads.guests.last30,
    'reads.users.total': stats.reads.users.total,
    'reads.users.last7': stats.reads.users.last7,
    'reads.users.last30': stats.reads.users.last30,
    'catalog.comics': stats.catalog.comics,
    'catalog.chapters': stats.catalog.chapters,
    'comments.last7': stats.comments.last7,
    'comments.moderatedLast7': stats.comments.moderatedLast7,
    auditLast24h: stats.auditLast24h,
  };
}

function topComicRow(comic: AdminStatsDto['topComics'][number]): HTMLTableRowElement {
  const row = el('tr');
  const title = el('th', 'chapter-table__cell');
  title.scope = 'row';
  const link = el('a', 'text-link admin-stats__work', comic.title);
  link.href = `/obra/${encodeURIComponent(comic.slug)}`;
  title.append(link);
  const number = (value: number) => {
    const td = cell(numberFormat.format(value));
    td.classList.add('admin-stats__number');
    return td;
  };
  row.append(title, number(comic.reads.last30), number(comic.reads.last7), number(comic.reads.total));
  return row;
}

function emptyTopRow(): HTMLTableRowElement {
  const row = el('tr');
  const td = cell('Aún no hay lecturas.');
  td.colSpan = 4;
  row.append(td);
  return row;
}

async function loadStats(): Promise<void> {
  const result = await getStats();
  if (!result.ok) {
    // Las tarjetas se quedan en «—»; el error se dice en la sección y no bloquea el resto del panel.
    if (statsMessage) statsMessage.textContent = errorText(result.error);
    return;
  }
  const { stats } = result.data;
  const values = statValues(stats);
  for (const target of document.querySelectorAll<HTMLElement>('[data-stat]')) {
    const value = values[target.dataset.stat ?? ''];
    if (value !== undefined) target.textContent = numberFormat.format(value);
  }
  if (moderatedNote) {
    const moderated = stats.comments.moderatedLast7;
    moderatedNote.textContent = `${numberFormat.format(moderated)} ${moderated === 1 ? 'moderado' : 'moderados'}`;
  }
  const day = madridDay.format(new Date(`${stats.today}T12:00:00Z`));
  for (const target of document.querySelectorAll<HTMLElement>('[data-stats-date]')) target.textContent = day;
  topComicsRows?.replaceChildren(...(stats.topComics.length > 0 ? stats.topComics.map(topComicRow) : [emptyTopRow()]));
  if (statsMessage) statsMessage.textContent = `Datos del ${day}.`;
  if (statsContent) statsContent.hidden = false;
  if (printButton) printButton.disabled = false;
}

// Exportación (D10): la vista de impresión de admin-stats.css; el navegador la guarda como PDF. Sin petición al servidor.
printButton?.addEventListener('click', () => window.print());

// --- Arranque: cada sección carga por su cuenta ---

bindFilters('comments', commentsState, loadComments);
bindFilters('users', usersState, loadUsers);
bindFilters('audit', auditState, loadAudit);
fillAuditFilters();
void Promise.all([loadStats(), loadReview(), loadComments(), loadUsers(), setUpSettings(), loadAudit()]);
