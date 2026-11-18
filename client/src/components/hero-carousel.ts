import { HERO_INTERVAL_MS, nextSlide, shouldRotate } from '../utils/hero.js';
import { sizeFromRatioToken } from '../utils/ratio.js';
import type { ComicCardDto } from './comic-card.js';
import { prepareCover } from './home-cover.js';

// Carrusel del hero (decisión del desarrollador, 18-nov): las obras que recibe y, al final, el banner que ya está en
// el HTML (sin JS solo se ve el banner). Las diapositivas se apilan en la misma celda (hero.css) para que el hero no
// cambie de alto; la inactiva va con `inert`, fuera del foco y de los lectores de pantalla. Patrón de carrusel de la
// APG: botón de pausa, un botón por diapositiva y aria-live="off" mientras rota solo.

function icon(name: string, small = false): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', small ? 'icon icon--small' : 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `/icons/sprite.svg#${name}`);
  svg.append(use);
  return svg;
}

function text(tag: 'p' | 'h2' | 'span', className: string, value: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}

function comicSlide(comic: ComicCardDto): HTMLElement {
  const slide = document.createElement('div');
  slide.className = 'hero__slide';
  slide.dataset['heroSlide'] = '';

  const copy = document.createElement('div');
  copy.className = 'hero__copy';
  const genre = comic.tags.find((tag) => tag.type === 'genre')?.name ?? 'Cómic';
  const actions = document.createElement('div');
  actions.className = 'hero__actions';
  const link = document.createElement('a');
  link.className = 'button button--primary button--large';
  link.href = `/obra/${encodeURIComponent(comic.slug)}`;
  // El nombre accesible lleva el título: «Ver obra» solo no dice cuál.
  link.append(icon('icon-book'), ' Ver obra', text('span', 'visually-hidden', `: ${comic.title}`), ' ', icon('icon-arrow', true));
  actions.append(link);
  copy.append(
    text('p', 'eyebrow', genre),
    text('h2', 'hero__title', comic.title),
    text('p', 'hero__description', comic.authorCredit),
    actions,
  );

  const art = document.createElement('div');
  art.className = 'hero__art';
  if (comic.coverUrl) {
    // Primera pantalla: sin loading="lazy".
    const image = document.createElement('img');
    image.className = 'home-cover__image';
    image.alt = '';
    const size = sizeFromRatioToken('--cover-ratio');
    if (size) {
      image.width = size.width;
      image.height = size.height;
    }
    image.src = comic.coverUrl;
    art.append(image);
  }
  prepareCover(art, comic.title);
  slide.append(copy, art);
  return slide;
}

export function startHeroCarousel(comics: readonly ComicCardDto[]): void {
  const hero = document.querySelector<HTMLElement>('#hero');
  const slidesBox = document.querySelector<HTMLElement>('#hero-slides');
  const banner = slidesBox?.querySelector<HTMLElement>('[data-hero-slide]');
  const controls = document.querySelector<HTMLElement>('#hero-controls');
  const pause = document.querySelector<HTMLButtonElement>('#hero-pause');
  const dots = document.querySelector<HTMLElement>('#hero-dots');
  if (!hero || !slidesBox || !banner || !controls || !pause || !dots || comics.length === 0) return;
  if (hero.dataset['carousel'] === 'on') return; // solo la primera carga del catálogo
  hero.dataset['carousel'] = 'on';
  hero.setAttribute('aria-roledescription', 'carrusel');

  const slides = [...comics.map(comicSlide), banner];
  slidesBox.prepend(...slides.slice(0, -1));
  const titles = [...comics.map((comic) => comic.title), 'Koma'];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const state = { current: 0, paused: false, hovered: false, focused: false };
  let timer: ReturnType<typeof setTimeout> | undefined;

  const buttons = slides.map((slide, index) => {
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'diapositiva');
    slide.setAttribute('aria-label', `${index + 1} de ${slides.length}`);
    const button = document.createElement('button');
    button.className = 'hero__dot';
    button.type = 'button';
    button.setAttribute('aria-label', `Diapositiva ${index + 1} de ${slides.length}: ${titles[index] ?? ''}`);
    button.addEventListener('click', () => {
      show(index);
      schedule();
    });
    return button;
  });
  dots.replaceChildren(...buttons);

  function rotating(): boolean {
    return shouldRotate({
      count: slides.length,
      paused: state.paused,
      hovered: state.hovered,
      focused: state.focused,
      reducedMotion: motion.matches,
      pageHidden: document.hidden,
    });
  }

  function show(index: number): void {
    state.current = index;
    slides.forEach((slide, position) => {
      const active = position === index;
      slide.classList.toggle('hero__slide--active', active);
      slide.inert = !active;
      const button = buttons[position];
      if (!button) return;
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  }

  function schedule(): void {
    clearTimeout(timer);
    const auto = rotating();
    // Mientras rota solo no se anuncia cada cambio; parado, sí (APG).
    slidesBox?.setAttribute('aria-live', auto ? 'off' : 'polite');
    pause?.toggleAttribute('hidden', motion.matches);
    if (auto) timer = setTimeout(() => {
      show(nextSlide(state.current, slides.length));
      schedule();
    }, HERO_INTERVAL_MS);
  }

  pause.addEventListener('click', () => {
    state.paused = !state.paused;
    pause.textContent = state.paused ? 'Reanudar el carrusel' : 'Pausar el carrusel';
    schedule();
  });
  // Solo el ratón: en táctil el toque dispararía «entrar» sin «salir» y el carrusel se quedaría parado.
  hero.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse') return;
    state.hovered = true;
    schedule();
  });
  hero.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'mouse') return;
    state.hovered = false;
    schedule();
  });
  hero.addEventListener('focusin', () => { state.focused = true; schedule(); });
  hero.addEventListener('focusout', (event) => {
    state.focused = event.relatedTarget instanceof Node && hero.contains(event.relatedTarget);
    schedule();
  });
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', schedule);

  controls.hidden = false;
  show(0);
  schedule();
}
