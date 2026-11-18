import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';

// Reglas generales de las hojas de estilo (client/CLAUDE.md) tras revisar con el agente frontend el CSS de Codex
// (314c14d, 17-nov). Se leen los archivos como texto, sin navegador: lo visual lo comprueba el desarrollador.

const stylesDir = path.join(paths.publicDir, 'styles');

function filesUnder(dir: string, extension: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full, extension);
    return entry.name.endsWith(extension) ? [full] : [];
  });
}

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Cada hoja, con su ruta relativa a styles/ con barras normales (también en Windows) y sin comentarios.
const sheets = filesUnder(stylesDir, '.css').map((file) => ({
  name: path.relative(stylesDir, file).split(path.sep).join('/'),
  css: withoutComments(readFileSync(file, 'utf8')),
}));

function sheet(name: string): string {
  const found = sheets.find((candidate) => candidate.name === name);
  assert.ok(found, `falta ${name}`);
  return found.css;
}

// Lo que pone clases, atributos y tokens fuera de las hojas: plantillas, TS del cliente y HTML que monta el servidor.
const code = [
  ...filesUnder(path.join(paths.root, 'client', 'src'), '.ts'),
  ...filesUnder(path.join(paths.publicDir, 'pages'), '.html'),
  ...filesUnder(path.join(paths.publicDir, 'errors'), '.html'),
  ...filesUnder(path.join(paths.root, 'server', 'src', 'utils'), '.ts'),
  ...filesUnder(path.join(paths.root, 'server', 'src', 'modules'), '.ts'),
]
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

interface Rule {
  media: string | null; // el @media que la envuelve; null, de primer nivel
  selector: string;
  body: string;
}

// Reglas de una hoja en su orden, con las de cada @media en su sitio.
function rules(css: string, media: string | null = null): Rule[] {
  const found: Rule[] = [];
  let at = 0;
  for (;;) {
    const open = css.indexOf('{', at);
    if (open === -1) return found;
    const selector = css.slice(at, open).trim();
    let depth = 1;
    let close = open + 1;
    for (; depth > 0 && close < css.length; close++) {
      if (css[close] === '{') depth++;
      else if (css[close] === '}') depth--;
    }
    const body = css.slice(open + 1, close - 1);
    if (selector.startsWith('@media')) found.push(...rules(body, selector));
    else found.push({ media, selector, body });
    at = close;
  }
}

const declarations = (body: string) =>
  body
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean);

test('Seguridad: (CSS) cada token de variables.css se usa en una hoja, una plantilla o el código', () => {
  const defined = [...sheet('variables.css').matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)]
    .map((match) => match[1])
    .filter((token): token is string => token !== undefined);
  const css = sheets.map((candidate) => candidate.css).join('\n');
  const unused = defined.filter(
    (token) => !new RegExp(`var\\(${token}[,)\\s]`).test(css) && !new RegExp(`${token}(?![a-z0-9-])`).test(code),
  );
  assert.deepEqual(unused, [], 'tokens sin uso: se borran o se usan');
});

test('Seguridad: (CSS) el desplazamiento de las anclas va en un solo sitio: scroll-padding-top de base.css, sin scroll-margin-top con --scroll-offset', () => {
  assert.match(sheet('base.css'), /scroll-padding-top:\s*var\(--scroll-offset\)/);
  const doubled = sheets
    .filter((candidate) => /scroll-margin-top:\s*var\(--scroll-offset\)/.test(candidate.css))
    .map((candidate) => candidate.name);
  assert.deepEqual(doubled, [], 'scroll-margin-top se suma a scroll-padding-top: el ancla quedaría el doble de baja');
});

test('Seguridad: (CSS) .button no baja su ancho mínimo de la palabra más larga: sin overflow-wrap: anywhere (una tabla partiría «Retirar»)', () => {
  const button = rules(sheet('components/button.css')).find((rule) => rule.media === null && rule.selector === '.button');
  assert.ok(button);
  assert.match(button.body, /min-width:\s*var\(--touch-target\)/, 'área táctil de 44 px');
  assert.doesNotMatch(button.body, /overflow-wrap:\s*anywhere/);
});

test('Seguridad: (CSS) cada atributo aria-* de un selector lo pone alguna plantilla, el TS del cliente o el servidor', () => {
  const attributes = new Set(
    sheets.flatMap((candidate) =>
      rules(candidate.css).flatMap((rule) => [...rule.selector.matchAll(/\[(aria-[a-z]+)/g)].map((match) => match[1] ?? '')),
    ),
  );
  const unused = [...attributes].filter((attribute) => !code.includes(attribute)).sort();
  assert.deepEqual(unused, [], 'una regla para un estado que nadie pone no se aplica nunca');
});

test('Seguridad: (CSS) el lector, sin navegación móvil, no le reserva hueco abajo, y el hueco de escritorio es un token', () => {
  const reader = rules(sheet('components/reader-page.css')).find((rule) => rule.selector === ':root:has(.reader-page)');
  assert.ok(reader);
  assert.match(reader.body, /--scroll-bottom-offset:/);
  assert.match(sheet('variables.css'), /--scroll-bottom-offset-wide:/);
  const base = sheet('base.css');
  assert.equal(base.match(/scroll-padding-bottom:/g)?.length, 1, 'solo en html, con var(--scroll-bottom-offset)');
  assert.match(base, /--scroll-bottom-offset:\s*var\(--scroll-bottom-offset-wide\)/);
});

test('Seguridad: (CSS) en cada hoja, los @media van al final, después de las reglas para móvil', () => {
  const late = sheets.flatMap((candidate) => {
    const all = rules(candidate.css);
    const first = all.findIndex((rule) => rule.media !== null);
    if (first === -1) return [];
    return all
      .slice(first)
      .filter((rule) => rule.media === null && !rule.selector.startsWith('@'))
      .map((rule) => `${candidate.name}: ${rule.selector}`);
  });
  assert.deepEqual(late, []);
});

test('Seguridad: (CSS) ningún :hover repite lo que ya hace su regla sin :hover', () => {
  const redundant = sheets.flatMap((candidate) => {
    const all = rules(candidate.css);
    return all
      .filter((rule) => !rule.selector.includes(',') && rule.selector.endsWith(':hover'))
      .filter((hover) => {
        const plain = all.find((rule) => rule.media === hover.media && rule.selector === hover.selector.slice(0, -':hover'.length));
        return plain !== undefined && declarations(hover.body).every((declaration) => declarations(plain.body).includes(declaration));
      })
      .map((rule) => `${candidate.name}: ${rule.selector}`);
  });
  assert.deepEqual(redundant, []);
});

test('Seguridad: (CSS) BEM: ningún selector de hijo por etiqueta (> div); el elemento lleva su clase', () => {
  const byTag = sheets.flatMap((candidate) =>
    rules(candidate.css)
      .filter((rule) => />\s*[a-z]+\b/.test(rule.selector))
      .map((rule) => `${candidate.name}: ${rule.selector}`),
  );
  assert.deepEqual(byTag, []);
});

test('Seguridad: (CSS) [hidden] se oculta solo en base.css (display: none !important): ninguna hoja lo repite', () => {
  assert.match(sheet('base.css'), /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  const repeated = sheets
    .filter((candidate) => candidate.name !== 'base.css')
    .flatMap((candidate) =>
      rules(candidate.css)
        .filter((rule) => rule.selector.split(',').some((part) => /\[hidden\]$/.test(part.trim())))
        .filter((rule) => declarations(rule.body).join(';') === 'display: none')
        .map((rule) => `${candidate.name}: ${rule.selector}`),
    );
  assert.deepEqual(repeated, []);
});
