import { adCard, type AdDto } from '../components/ad.js';
import { retryAtText, startCountdown } from '../components/timer.js';
import { api, type ApiResult } from '../services/api.js';
import { fullscreenButtonState, toggleFullscreen } from '../utils/fullscreen.js';

// Lector (CU-03, CU-04, CU-12, CU-24). La ruta HTML ya comprobó obra y capítulo (404, 410) e inyectó el título
// y la advertencia. El permiso lo decide la API: aquí se hace el POST de la lectura y se muestra lo que
// responda (tira, intersticial, anuncio, invitación o muro de saldo). Todo dato de la obra va con textContent.

interface ReadingDto {
  comic: { slug: string; title: string; contentWarning: string | null };
  chapter: { number: number; title: string; prev: number | null; next: number | null };
  panels: { position: number; url: string; width: number; height: number }[];
  ads: { interstitial: AdDto | null; end: AdDto | null };
  balance: { balance: number; max: number; retryAt: string | null } | null;
}

interface AdStartDto {
  ad: AdDto | null;
  adToken: string;
  minSeconds: number;
}

// Viñetas que se cargan sin loading="lazy": las de la primera pantalla.
const EAGER_PANELS = 2;
// setTimeout no admite esperas mayores (unos 24,8 días).
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const [, , slug = '', numberText = ''] = location.pathname.split('/');
const number = Number(numberText);
const comicUrl = `/obra/${slug}`;
const readPath = `/api/comics/${slug}/chapters/${number}/read`;
const warningKey = `koma:aviso-aceptado:${slug}`;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const status = byId<HTMLElement>('reader-status');
const screen = byId<HTMLElement>('reader-screen');
const strip = byId<HTMLElement>('lector');
const stream = byId<HTMLElement>('reader-stream');
const endAd = byId<HTMLElement>('reader-end-ad');
const end = byId<HTMLElement>('reader-end');
const endText = byId<HTMLElement>('reader-end-text');
const nextLink = byId<HTMLAnchorElement>('reader-next');
const balanceNote = byId<HTMLElement>('reader-balance');
const fullscreenButton = byId<HTMLButtonElement>('reader-fullscreen');
const fullscreenLabel = byId<HTMLElement>('reader-fullscreen-label');
const exitButton = byId<HTMLButtonElement>('reader-exit');
const contentWarning = document.querySelector('[data-content-warning]')?.textContent?.trim() ?? '';

const store = {
  loading: false,
  adToken: null as string | null, // RN-01: se guarda para "Recargar" (vale 30 min)
  stopTimer: null as (() => void) | null,
  fullscreenOffset: 0, // posición dentro de la tira, para no perderla al entrar o salir de pantalla completa
  moveFocus: false, // tras pulsar un botón que desaparece, el foco pasa al título de lo nuevo
};

function announce(text: string): void {
  if (status) status.textContent = text;
}

function linkButton(label: string, href: string, primary = false): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = `button ${primary ? 'button--primary' : 'button--outline'}`;
  link.href = href;
  link.textContent = label;
  return link;
}

function actionButton(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = `button ${primary ? 'button--primary' : 'button--outline'}`;
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => {
    store.moveFocus = true;
    onClick();
  });
  return button;
}

const backToComic = () => linkButton('Volver a la obra', comicUrl);

// Mezcla BEM: un bloque ajeno (advertencia, anuncio) colocado dentro de una pantalla.
function screenBlock<T extends HTMLElement>(element: T): T {
  element.classList.add('reader-screen__block');
  return element;
}

interface ScreenParts {
  eyebrow?: string;
  title: string;
  text?: string;
  content?: HTMLElement[];
  actions?: HTMLElement[];
}

function stopTimer(): void {
  store.stopTimer?.();
  store.stopTimer = null;
}

// Solo tras una acción del usuario (no al cargar la página): el botón pulsado ya no existe y el foco se
// perdería en <body>.
function focusAfterAction(target: HTMLElement | null): void {
  if (!store.moveFocus || !target) return;
  store.moveFocus = false;
  target.focus();
}

// Una sola pantalla a la vez en lugar de la tira (D25).
function showScreen(parts: ScreenParts): void {
  stopTimer();
  if (!screen) return;
  // Con la tira en pantalla completa, solo se vería una pantalla negra: primero se sale (D24).
  if (strip && document.fullscreenElement === strip) void document.exitFullscreen().catch(() => undefined);
  const children: HTMLElement[] = [];
  if (parts.eyebrow) {
    const eyebrow = document.createElement('p');
    eyebrow.className = 'reader-page__eyebrow';
    eyebrow.textContent = parts.eyebrow;
    children.push(eyebrow);
  }
  const title = document.createElement('h2');
  title.className = 'reader-screen__title';
  title.id = 'reader-screen-title';
  title.tabIndex = -1;
  title.textContent = parts.title;
  children.push(title);
  if (parts.text) {
    const text = document.createElement('p');
    text.className = 'reader-screen__text';
    text.textContent = parts.text;
    children.push(text);
  }
  children.push(...(parts.content ?? []));
  if (parts.actions?.length) {
    const actions = document.createElement('div');
    actions.className = 'reader-screen__actions';
    actions.append(...parts.actions);
    children.push(actions);
  }
  screen.replaceChildren(...children);
  screen.hidden = false;
  for (const element of [strip, endAd, end, fullscreenButton]) if (element) element.hidden = true;
  // "Cargando…" es una pantalla de paso: el foco espera a la siguiente.
  if (!parts.title.endsWith('...')) focusAfterAction(title);
}

// --- RN-08 / D7: la advertencia se acepta antes del POST, así no se gasta saldo sin aceptarla ---

function warningAccepted(): boolean {
  try {
    return localStorage.getItem(warningKey) === '1';
  } catch {
    return false;
  }
}

function rememberWarning(): void {
  try {
    localStorage.setItem(warningKey, '1');
  } catch {
    // Sin almacenamiento, se vuelve a preguntar en la próxima visita.
  }
}

function showWarning(): void {
  const box = document.createElement('div');
  box.className = 'content-warning';
  const symbol = document.createElement('div');
  symbol.className = 'content-warning__symbol';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = '!';
  const text = document.createElement('p');
  text.className = 'content-warning__text';
  text.textContent = contentWarning;
  box.append(symbol, text);
  screenBlock(box);
  showScreen({
    eyebrow: `Capítulo ${number}`,
    title: 'Advertencia de contenido',
    text: 'Esta obra lleva una advertencia. Léela antes de empezar: solo te la mostraremos una vez en este dispositivo.',
    content: [box],
    actions: [
      actionButton('Aceptar y leer', () => {
        rememberWarning();
        void read();
      }, true),
      backToComic(),
    ],
  });
}

// --- Respuestas sin capítulo: anuncio (RN-01), invitación (RN-01) y muro de saldo (RN-02) ---

async function showAd(): Promise<void> {
  const eyebrow = `Capítulo ${number}`;
  showScreen({ eyebrow, title: 'Cargando el anuncio...' });
  const result = await api.get<AdStartDto>(`/api/comics/${slug}/ad`);
  if (!result.ok) {
    showError(result, () => { void showAd(); });
    return;
  }
  const { ad, adToken, minSeconds } = result.data;
  const proceed = actionButton(`Continuar en ${minSeconds} s`, () => {
    store.adToken = adToken;
    void read();
  }, true);
  proceed.disabled = true;
  showScreen({
    eyebrow,
    title: 'Mira un anuncio para leer este capítulo',
    text: `El capítulo ${number} se desbloquea al terminar el anuncio, sin cuenta.`,
    content: ad ? [screenBlock(adCard(ad, true))] : [], // sin anuncios activos, solo la cuenta atrás (D6)
    actions: [proceed, backToComic()],
  });
  announce(`El anuncio dura ${minSeconds} segundos.`);
  store.stopTimer = startCountdown(
    minSeconds,
    (left) => { proceed.textContent = left > 0 ? `Continuar en ${left} s` : 'Continuar al capítulo'; },
    () => {
      proceed.disabled = false;
      announce('Ya puedes continuar al capítulo.');
    },
  );
}

function showInvitation(): void {
  // Antes de ir al login se guarda el fragmento #v-n (CLAUDE.md): auth.ts vuelve a `next` con él.
  const fragment = /^#v-\d+$/.test(location.hash) ? location.hash : '';
  const query = new URLSearchParams({ next: `${location.pathname}${fragment}` }).toString();
  showScreen({
    eyebrow: `Capítulo ${number}`,
    title: 'Crea una cuenta para seguir leyendo',
    text: 'Con una cuenta gratis lees más capítulos: cada capítulo nuevo usa 1 de tu saldo de lectura, que se recarga con el tiempo.',
    actions: [linkButton('Crear cuenta gratis', `/registro?${query}`, true), linkButton('Entrar', `/entrar?${query}`), backToComic()],
  });
}

function showLimit(retryAt: string | undefined): void {
  const at = retryAt ? new Date(retryAt) : null;
  const valid = at !== null && !Number.isNaN(at.getTime());
  // D25: al llegar retryAt aparece "Leer ahora"; nunca se reintenta solo, para no gastar saldo sin una acción.
  const readNow = actionButton('Leer ahora', () => { void read(); }, true);
  readNow.hidden = true;
  showScreen({
    eyebrow: `Capítulo ${number}`,
    title: 'Te has quedado sin saldo de lectura',
    text: valid
      ? `Tu saldo se recarga con el tiempo: podrás leer este capítulo ${retryAtText(at, new Date())}. Releer los capítulos que ya leíste no gasta saldo.`
      : 'Tu saldo se recarga con el tiempo. Releer los capítulos que ya leíste no gasta saldo.',
    actions: [readNow, backToComic()],
  });
  if (valid) {
    const timeout = setTimeout(() => {
      readNow.hidden = false;
      announce('Ya puedes leer este capítulo.');
    }, Math.min(Math.max(0, at.getTime() - Date.now()), MAX_TIMEOUT_MS));
    store.stopTimer = () => clearTimeout(timeout);
  }
}

function showError(result: Extract<ApiResult<unknown>, { ok: false }>, retry: () => void): void {
  // 404 o 410: la obra o el capítulo dejaron de ser públicos desde que se cargó la página.
  if (result.status === 404 || result.status === 410) {
    showScreen({ title: result.error.message, actions: [backToComic(), linkButton('Ir al catálogo', '/#catalogo')] });
    return;
  }
  showScreen({
    title: 'No se pudo cargar el capítulo',
    text: result.error.message,
    actions: [actionButton('Reintentar', retry, true), backToComic()],
  });
}

function handleReadError(result: Extract<ApiResult<unknown>, { ok: false }>): void {
  if (result.status === 401) return showInvitation();
  if (result.error.code === 'AD_NOT_COMPLETED') {
    store.adToken = null; // caducado o de otra obra: anuncio nuevo
    void showAd();
    return;
  }
  if (result.error.code === 'READING_LIMIT') return showLimit(result.error.retryAt);
  showError(result, () => { void read(); });
}

// --- RN-03: anuncio intersticial ---

// La API lo envía con el capítulo cuando toca (la lectura ya está registrada): una pantalla antes de la tira,
// sin espera (aprobado el 4-nov), y "Continuar" pinta el capítulo que ya llegó.
function showInterstitial(reading: ReadingDto, ad: AdDto): void {
  showScreen({
    eyebrow: `Capítulo ${number}`,
    title: 'Antes de seguir',
    text: 'Los anuncios hacen posible la lectura gratis en Koma. Con Premium lees sin anuncios.',
    content: [screenBlock(adCard(ad, true))],
    actions: [actionButton(`Continuar al capítulo ${number}`, () => renderReading(reading), true), backToComic()],
  });
  announce(`Anuncio antes del capítulo ${number}.`);
}

// --- La tira ---

function panelFigure(panel: ReadingDto['panels'][number], index: number): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'reader-panel';
  figure.id = `v-${panel.position}`; // RN-09: enlace profundo /leer/:slug/:numero#v-n
  // Sin el figcaption "Viñeta N, capítulo N" de la maqueta: repetía el alt y se leía dos veces.
  const image = document.createElement('img');
  image.className = 'reader-panel__image';
  image.src = panel.url;
  image.width = panel.width;
  image.height = panel.height;
  image.alt = `Viñeta ${panel.position} del capítulo ${number}`;
  image.decoding = 'async';
  if (index >= EAGER_PANELS) image.loading = 'lazy';

  const error = document.createElement('div');
  error.className = 'reader-panel__error';
  error.hidden = true;
  const message = document.createElement('p');
  message.textContent = 'No se pudo cargar esta viñeta.';
  // D22: "Recargar" repite el POST (URLs firmadas nuevas, sin volver a consumir) y no mueve la página.
  error.append(message, actionButton('Recargar', () => { void read('reload'); }));
  image.addEventListener('error', () => { error.hidden = false; });
  image.addEventListener('load', () => { error.hidden = true; });

  figure.append(image, error);
  return figure;
}

function renderBalance(balance: ReadingDto['balance']): void {
  if (!balanceNote) return;
  balanceNote.hidden = balance === null;
  if (!balance) return;
  const retry = balance.retryAt ? ` · se recarga ${retryAtText(new Date(balance.retryAt), new Date())}` : '';
  balanceNote.textContent = `Saldo de lectura: ${balance.balance} de ${balance.max}${retry}`;
}

function renderReading(reading: ReadingDto): void {
  stopTimer();
  if (screen) {
    screen.hidden = true;
    screen.replaceChildren();
  }
  renderBalance(reading.balance);
  stream?.replaceChildren(...reading.panels.map(panelFigure));
  if (strip) strip.hidden = false;

  // RN-03: anuncio al final del capítulo.
  if (endAd) {
    endAd.replaceChildren(...(reading.ads.end ? [adCard(reading.ads.end)] : []));
    endAd.hidden = reading.ads.end === null;
  }
  const next = reading.chapter.next;
  if (endText) {
    endText.textContent = next === null
      ? 'Has llegado al último capítulo publicado de esta obra.'
      : `Sigue con el capítulo ${next} o vuelve a la lista de capítulos.`;
  }
  if (nextLink) {
    nextLink.hidden = next === null;
    if (next !== null) nextLink.href = `/leer/${slug}/${next}`;
  }
  if (end) end.hidden = false;
  setUpFullscreen();
  focusAfterAction(document.getElementById('chapter-title'));
  announce(`Capítulo ${number}: ${reading.panels.length} viñetas.`);

  // El contenido llega después de cargar la página: el navegador ya no salta solo al #v-n.
  if (/^#v-\d+$/.test(location.hash)) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

// Sustituye las URLs de las imágenes que ya están en la página, sin volver a pintarla: la posición se conserva.
function refreshPanels(reading: ReadingDto): void {
  for (const panel of reading.panels) {
    const figure = document.getElementById(`v-${panel.position}`);
    const image = figure?.querySelector<HTMLImageElement>('.reader-panel__image');
    const error = figure?.querySelector<HTMLElement>('.reader-panel__error');
    if (error) error.hidden = true;
    if (image) image.src = panel.url;
  }
  renderBalance(reading.balance);
  announce('Imágenes recargadas.');
}

async function read(mode: 'show' | 'reload' = 'show'): Promise<void> {
  if (store.loading) return;
  store.loading = true;
  if (mode === 'show') showScreen({ eyebrow: `Capítulo ${number}`, title: 'Cargando el capítulo...' });
  const options = store.adToken ? { headers: { 'X-Ad-Token': store.adToken } } : undefined;
  const result = await api.post<{ reading: ReadingDto }>(readPath, undefined, options);
  store.loading = false;
  // La recarga no cambia de pantalla: el foco no se mueve (salvo si la API niega el capítulo, más abajo).
  if (mode === 'reload' && (result.ok || result.status === 0 || result.status >= 500)) store.moveFocus = false;
  if (result.ok) {
    const { reading } = result.data;
    // "Recargar" es una relectura: la API nunca trae ahí el intersticial.
    if (mode === 'reload') refreshPanels(reading);
    else if (reading.ads.interstitial) showInterstitial(reading, reading.ads.interstitial);
    else renderReading(reading);
    return;
  }
  // Si falla la recarga por la red, la tira se queda como está y se avisa; si la API niega el capítulo
  // (sesión caducada, token vencido), se muestra su pantalla.
  if (mode === 'reload' && (result.status === 0 || result.status >= 500)) {
    announce(result.error.message);
    return;
  }
  handleReadError(result);
}

// --- Pantalla completa (D24) ---

let fullscreenReady = false;

function syncFullscreenButton(): void {
  if (!fullscreenButton || !fullscreenLabel || !strip) return;
  const state = fullscreenButtonState(document, strip);
  fullscreenButton.disabled = state.disabled;
  fullscreenButton.setAttribute('aria-pressed', String(state.pressed));
  fullscreenButton.setAttribute('aria-label', state.label);
  fullscreenLabel.textContent = state.label;
  if (state.title) fullscreenButton.title = state.title;
  else fullscreenButton.removeAttribute('title');
}

function setUpFullscreen(): void {
  if (!fullscreenButton || !strip) return;
  fullscreenButton.hidden = false;
  syncFullscreenButton();
  if (fullscreenReady) return;
  fullscreenReady = true;

  const toggle = () => {
    if (document.fullscreenElement !== strip) {
      store.fullscreenOffset = Math.max(0, window.scrollY - (strip.getBoundingClientRect().top + window.scrollY));
    }
    void toggleFullscreen(document, strip);
  };
  fullscreenButton.addEventListener('click', toggle);
  exitButton?.addEventListener('click', toggle);
  strip.addEventListener('scroll', () => {
    if (document.fullscreenElement === strip) store.fullscreenOffset = strip.scrollTop;
  });
  // También al salir con Esc o con el gesto del sistema: el estado del botón nunca se queda desfasado.
  document.addEventListener('fullscreenchange', () => {
    syncFullscreenButton();
    if (document.fullscreenElement === strip) {
      strip.scrollTop = store.fullscreenOffset;
      exitButton?.focus({ preventScroll: true });
    } else if (!strip.hidden) {
      window.scrollTo({ top: strip.getBoundingClientRect().top + window.scrollY + store.fullscreenOffset, behavior: 'instant' });
      fullscreenButton.focus({ preventScroll: true });
    }
    // Con la tira oculta (showScreen salió de pantalla completa para enseñar otra pantalla), ni se desplaza la
    // página ni se mueve el foco: ya lo tiene el título de la pantalla nueva.
  });
}

// --- Inicio ---

if (contentWarning && !warningAccepted()) showWarning();
else void read();
