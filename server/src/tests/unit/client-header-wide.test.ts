import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';

// Cabecera de escritorio (aprobado el 17-nov): con cinco enlaces (Inicio, Explorar, Comunidad, Tutoriales y Crear)
// la navegación no cabe en la fila de la cabecera hasta unos 1280 px. Entre 64 y 80rem va en su propia fila; desde
// 80rem, en una sola fila. 80rem es una excepción a «mobile-first con 40rem y 64rem» (client/CLAUDE.md), solo para
// la cabecera y para el desplazamiento de las anclas, que cuenta con su altura. Se leen las hojas como texto.

const stylesDir = path.join(paths.publicDir, 'styles');

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

const sheets = filesUnder(stylesDir).map((file) => ({
  name: path.relative(stylesDir, file).split(path.sep).join('/'),
  css: readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
}));

function sheet(name: string): string {
  const found = sheets.find((candidate) => candidate.name === name);
  assert.ok(found, `falta ${name}`);
  return found.css;
}

// Cuerpo de la regla `selector` dentro de `@media (min-width: <width>)`.
function ruleIn(css: string, width: string, selector: string): string {
  const media = css.indexOf(`@media (min-width: ${width})`);
  assert.notEqual(media, -1, `sin @media (min-width: ${width})`);
  let depth = 0;
  let end = css.indexOf('{', media);
  for (; end < css.length; end++) {
    if (css[end] === '{') depth++;
    else if (css[end] === '}' && --depth === 0) break;
  }
  const block = css.slice(css.indexOf('{', media) + 1, end);
  const match = new RegExp(`(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(block);
  assert.ok(match, `sin ${selector} en ${width}`);
  return match[1] ?? '';
}

const areas = (body: string) => /grid-template-areas:\s*([^;]+);/.exec(body)?.[1]?.replace(/\s+/g, ' ').trim();

test('Seguridad: (CSS) los cortes son 40rem y 64rem; 80rem, solo en la cabecera (site-header.css) y en las anclas (base.css)', () => {
  const found = sheets.flatMap((candidate) =>
    [...candidate.css.matchAll(/@media\s*\(min-width:\s*([^)]+)\)/g)].map((match) => ({ name: candidate.name, width: match[1]?.trim() })),
  );
  const wrong = found
    .filter(({ name, width }) => !(width === '40rem' || width === '64rem' || (width === '80rem' && ['components/site-header.css', 'base.css'].includes(name))))
    .map(({ name, width }) => `${name}: ${width}`);
  assert.deepEqual(wrong, []);
});

test('Seguridad: (CSS) entre 64 y 80rem la navegación de la cabecera va en su propia fila; desde 80rem, en la misma fila', () => {
  const css = sheet('components/site-header.css');
  assert.equal(areas(ruleIn(css, '64rem', '.site-header__inner')), '"brand search account" "nav nav nav"');
  assert.equal(areas(ruleIn(css, '80rem', '.site-header__inner')), '"brand nav search account"');
});

test('Seguridad: (CSS) entre 64 y 80rem el desplazamiento de las anclas suma la fila de la navegación; desde 80rem vuelve al de una fila', () => {
  const tokens = sheet('variables.css');
  assert.match(tokens, /--scroll-offset-nav-row:\s*calc\(var\(--header-height-wide\) \+ var\(--touch-target\) \+ var\(--space-4\) \+ env\(safe-area-inset-top\)\)/);
  const base = sheet('base.css');
  assert.match(ruleIn(base, '64rem', ':root'), /--scroll-offset:\s*var\(--scroll-offset-nav-row\)/);
  assert.match(ruleIn(base, '80rem', ':root'), /--scroll-offset:\s*var\(--scroll-offset-wide\)/);
});
