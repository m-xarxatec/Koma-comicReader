import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';

// Integración de la portada y el perfil de E4 (diseno-final, 18-nov). Carrusel del hero aprobado por el desarrollador:
// las 2 obras más nuevas del catálogo y después el banner de D6 (koma-hero.webp), rotando. Más las correcciones de la
// revisión del agente frontend: aviso sin JS en el cambio de contraseña y cada regla de CSS en el archivo de su componente.

interface RotationState {
  count: number;
  paused: boolean;
  hovered: boolean;
  focused: boolean;
  reducedMotion: boolean;
  pageHidden: boolean;
}
interface ClientHero {
  HERO_COMICS: number;
  HERO_INTERVAL_MS: number;
  SHELF_SIZE: number;
  splitHome: <T>(comics: readonly T[]) => { hero: T[]; shelf: T[] };
  nextSlide: (current: number, count: number) => number;
  shouldRotate: (state: RotationState) => boolean;
}

const load = <T>(file: string) => import(pathToFileURL(path.join(paths.clientDistDir, file)).href) as Promise<T>;
const hero = await load<ClientHero>('utils/hero.js');

const read = (...parts: string[]) => readFileSync(path.join(paths.publicDir, ...parts), 'utf8');
const css = (file: string) => read('styles', 'components', file).replace(/\/\*[\s\S]*?\*\//g, '');
const count = (text: string, part: string) => text.split(part).length - 1;
const moving: RotationState = { count: 3, paused: false, hovered: false, focused: false, reducedMotion: false, pageHidden: false };

test('Seguridad: (hero) las 2 primeras obras del catálogo van al carrusel y «Más para leer» sigue con las 4 siguientes', () => {
  assert.equal(hero.HERO_COMICS, 2);
  assert.equal(hero.SHELF_SIZE, 4);
  assert.deepEqual(hero.splitHome([1, 2, 3, 4, 5, 6, 7, 8]), { hero: [1, 2], shelf: [3, 4, 5, 6] });
  assert.deepEqual(hero.splitHome([1, 2, 3]), { hero: [1, 2], shelf: [3] });
  assert.deepEqual(hero.splitHome([1]), { hero: [1], shelf: [] });
  assert.deepEqual(hero.splitHome([]), { hero: [], shelf: [] });
});

test('Seguridad: (hero) tras la última diapositiva vuelve a la primera', () => {
  assert.equal(hero.nextSlide(0, 3), 1);
  assert.equal(hero.nextSlide(1, 3), 2);
  assert.equal(hero.nextSlide(2, 3), 0);
  assert.equal(hero.nextSlide(0, 1), 0);
  assert.equal(hero.nextSlide(0, 0), 0);
});

test('Seguridad: (hero) solo rota con más de una diapositiva, sin pausa, sin ratón ni foco encima, con la pestaña visible y sin movimiento reducido (WCAG 2.2.2)', () => {
  assert.equal(hero.shouldRotate(moving), true);
  assert.equal(hero.shouldRotate({ ...moving, count: 1 }), false, 'solo el banner');
  for (const key of ['paused', 'hovered', 'focused', 'reducedMotion', 'pageHidden'] as const) {
    assert.equal(hero.shouldRotate({ ...moving, [key]: true }), false, key);
  }
  assert.ok(hero.HERO_INTERVAL_MS >= 5000, 'cada diapositiva se ve al menos 5 s');
});

test('Seguridad: (hero) sin JS se ve el banner; el único h1 queda fuera de las diapositivas y los controles empiezan ocultos', () => {
  const html = read('pages', 'home.html');
  assert.equal(count(html, '<h1'), 1);
  // El h1 no rota: si fuera en una diapositiva, quedaría inerte mientras se ve otra.
  assert.match(html, /<section class="hero" id="hero"[^>]*>\s*<h1 class="visually-hidden" id="hero-title">/);
  assert.equal(count(html, 'data-hero-slide'), 1, 'en el HTML solo está el banner; las obras las añade home.ts');
  assert.match(html, /<div class="hero__slide hero__slide--active" data-hero-slide>/);
  assert.match(html, /<div class="hero__art hero__art--banner" aria-hidden="true"><\/div>/);
  assert.match(html, /<div class="hero__controls" id="hero-controls" hidden>/);
  assert.match(html, /<button class="hero__pause" type="button" id="hero-pause">Pausar el carrusel<\/button>/);
});

test('Seguridad: (D6) el banner es koma-hero.webp, pintado desde un token de variables.css', () => {
  const file = path.join(paths.publicDir, 'icons', 'koma-hero.webp');
  assert.ok(existsSync(file));
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP');
  assert.match(read('styles', 'variables.css'), /--image-home-hero:\s*url\("\/icons\/koma-hero\.webp"\);/);
  assert.match(css('hero.css'), /\.hero__art--banner\s*\{[^}]*var\(--image-home-hero\)/);
});

test('Seguridad: (CSS) home-main.css solo da estilo a .home-main; cada componente lleva sus reglas en su archivo', () => {
  const selectors = [...css('home-main.css').matchAll(/([^{}@]+)\{/g)].map((match) => match[1]!.trim()).filter((s) => !s.startsWith('media'));
  assert.ok(selectors.length > 0);
  for (const selector of selectors) assert.equal(selector, '.home-main', selector);
  assert.ok(!css('profile-page.css').includes('.breadcrumb'), 'las migas no se cambian desde el perfil');
  assert.ok(!css('profile-card.css').includes('.button:hover'), 'el hover del botón no se cambia desde el perfil');
  assert.match(css('button.css'), /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.button:hover:not\(:disabled\)\s*\{\s*transform:\s*none;/);
});

test('Seguridad: (CSS) sin estilos ni tokens muertos tras el rediseño de la portada', () => {
  const all = readdirSync(path.join(paths.publicDir, 'styles', 'components')).map((file) => css(file)).join('\n');
  for (const gone of ['.genre-tile__art', '.hero__accent', '.scroll-lane']) assert.ok(!all.includes(gone), gone);
  assert.ok(!existsSync(path.join(paths.publicDir, 'styles', 'components', 'scroll-lane.css')));
  assert.ok(!read('pages', 'home.html').includes('scroll-lane'));
  const variables = read('styles', 'variables.css');
  for (const token of ['--home-genre-art-size', '--radius-home-genre-icon', '--color-home-genre-icon', '--home-genre-slide-width', '--home-genre-column-share', '--home-genre-height', '--home-genre-tile-padding', '--home-cover-type']) {
    assert.ok(!variables.includes(`${token}`), token);
  }
});

test('Seguridad: sin JS, el cambio de contraseña del perfil avisa de que hace falta JavaScript', () => {
  const html = read('pages', 'profile.html');
  const form = html.slice(html.indexOf('<form class="form profile-card__form" id="password-form"'), html.indexOf('</form>', html.indexOf('id="password-form"')));
  assert.match(form, /<noscript>\s*<p class="form__notice">[^<]*JavaScript[^<]*<\/p>\s*<\/noscript>/);
});

test('Seguridad: sin JS, el cambio de contraseña no se envía: el botón llega desactivado (data-needs-js), como el del nombre', () => {
  const html = read('pages', 'profile.html');
  assert.match(html, /<button class="button button--outline" type="submit" disabled data-needs-js>Cambiar contraseña<\/button>/);
});

test('Seguridad: (hero, APG) sin JS no se anuncia como carrusel; la pausa va antes de las diapositivas y dice qué para', () => {
  const html = read('pages', 'home.html');
  assert.ok(!html.includes('aria-roledescription'), 'lo pone hero-carousel.ts al arrancar');
  assert.ok(html.indexOf('id="hero-controls"') < html.indexOf('id="hero-slides"'), 'la pausa, la primera al tabular');
  assert.match(html, /<button class="hero__pause" type="button" id="hero-pause">Pausar el carrusel<\/button>/);
});

test('Seguridad: (CSS) la ficha no cambia las migas ni el aviso de contenido desde sus propias hojas', () => {
  assert.ok(!css('work-page.css').includes('.breadcrumb'));
  assert.ok(!css('work-detail.css').includes('.content-warning'));
  assert.match(css('content-warning.css'), /\.content-warning--inline\s*\{/);
  assert.match(read('pages', 'comic.html'), /<aside class="content-warning content-warning--inline" id="work-warning"/);
});
