// Carrusel del hero de la portada (D22, 18-nov: cambia D6, cuyo banner queda como última diapositiva): las 2 obras más nuevas del
// catálogo y después el banner, rotando. Funciones puras; el DOM está en components/hero-carousel.ts.

export const HERO_COMICS = 2;
// «Más para leer»: las 4 obras que siguen a las del hero.
export const SHELF_SIZE = 4;
// Cada diapositiva se ve 7 s: más de los 5 s a partir de los que WCAG 2.2.2 pide poder pausar (hay botón de pausa).
export const HERO_INTERVAL_MS = 7000;

export interface RotationState {
  count: number;
  paused: boolean;
  hovered: boolean;
  focused: boolean;
  reducedMotion: boolean;
  pageHidden: boolean;
}

export function splitHome<T>(comics: readonly T[]): { hero: T[]; shelf: T[] } {
  return { hero: comics.slice(0, HERO_COMICS), shelf: comics.slice(HERO_COMICS, HERO_COMICS + SHELF_SIZE) };
}

export function nextSlide(current: number, count: number): number {
  return count > 0 ? (current + 1) % count : 0;
}

// Se para con la pausa, con el ratón o el foco dentro, con la pestaña oculta y con movimiento reducido.
export function shouldRotate(state: RotationState): boolean {
  return state.count > 1 && !state.paused && !state.hovered && !state.focused && !state.reducedMotion && !state.pageHidden;
}
