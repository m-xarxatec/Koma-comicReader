import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';

// Plan de limpieza del harness, H6 y tarea B10: cada ruta del árbol de «## Estructura» de CLAUDE.md existe. El árbol
// solo nombra lo que ya existe: lo aprobado y aún sin construir entra en el árbol en el mismo commit que sus archivos.
// Reglas del analizador:
// - cada línea es «rama + entradas [# comentario]»; la sangría (4 caracteres por nivel) da la carpeta padre;
// - antes de «#», cada entrada separada por «·» es una ruta (carpeta si acaba en «/»);
// - en el comentario solo cuentan las carpetas («x/») y los archivos con extensión conocida, relativos a la carpeta de
//   la línea; un paréntesis tras una carpeta lista su contenido y tras un archivo lo describe (no se comprueba);
// - un comentario que es solo una lista de nombres («auth, users, …», quizá tras «texto:») nombra carpetas o archivos
//   de esa carpeta con cualquier extensión («nombre.*»);
// - no cuentan los marcadores («pages/<página>.html» solo comprueba «pages/») ni lo que sigue a «→» (lo genera tsc);
// - lo que ignora .gitignore no se comprueba: no está en un clon limpio ni en la CI.

const DIR = /^[\w.-]+(?:\/[\w.-]+)*\/$/;
const PATH = /^[\w.-]+(?:\/[\w.-]+)*$/;
const NAME = /^[a-z][a-z0-9-]*$/;
const EXTENSIONS = new Set(['css', 'html', 'jpg', 'js', 'json', 'md', 'mjs', 'png', 'sql', 'svg', 'ts', 'webp', 'yml']);
const WILDCARD_EXTENSION = '.*';

function treeLines(claudeMd: string): string[] {
  const lines = claudeMd.split(/\r?\n/);
  const heading = lines.indexOf('## Estructura');
  const open = lines.findIndex((line, index) => index > heading && line.startsWith('```'));
  const close = lines.findIndex((line, index) => index > open && line.startsWith('```'));
  if (heading === -1 || open === -1 || close === -1) throw new Error('CLAUDE.md: no encuentro el árbol de «## Estructura»');
  return lines.slice(open + 1, close);
}

function tokenize(text: string): string[] {
  return text
    .replace(/[()→]/g, ' $& ')
    .split(/[\s,;:`·«»]+/)
    .filter((token) => token !== '');
}

// Ruta relativa que nombra un token, o null. `entry`: el token es una entrada (antes de «#» y fuera de paréntesis).
function tokenPath(token: string, entry: boolean): string | null {
  const marker = token.search(/[<>]/);
  if (marker !== -1) {
    const prefix = token.slice(0, marker);
    return DIR.test(prefix) ? prefix : null;
  }
  if (DIR.test(token)) return token;
  if (!PATH.test(token)) return null;
  if (entry) return token;
  const dot = token.lastIndexOf('.');
  return dot > 0 && EXTENSIONS.has(token.slice(dot + 1)) ? token : null;
}

interface Found {
  all: string[];
  entries: string[]; // las rutas fuera de paréntesis
}

function pathsIn(text: string, base: string, entry: boolean): Found {
  const found: Found = { all: [], entries: [] };
  const contexts: (string | null)[] = []; // carpeta de cada paréntesis abierto, o null si describe un archivo
  let previous: string | null = null;
  for (const token of tokenize(text)) {
    if (token === '→') break;
    const context = contexts.length === 0 ? base : contexts[contexts.length - 1];
    if (token === '(') {
      contexts.push(previous === null ? context : previous.endsWith('/') ? previous : null);
      previous = null;
      continue;
    }
    if (token === ')') {
      contexts.pop();
      previous = null;
      continue;
    }
    const relative = context === null || context === undefined ? null : tokenPath(token, entry && contexts.length === 0);
    if (relative === null) {
      previous = null;
      continue;
    }
    previous = `${context}${relative}`;
    found.all.push(previous);
    if (contexts.length === 0) found.entries.push(previous);
  }
  return found;
}

function namesIn(comment: string, base: string): string[] {
  let text = comment.split('→')[0] ?? '';
  for (let before = ''; before !== text; ) {
    before = text;
    text = text.replace(/\([^()]*\)/g, '');
  }
  const items = text
    .slice(text.lastIndexOf(':') + 1)
    .split(',')
    .map((item) => item.trim());
  if (items.length < 2 || !items.every((item) => NAME.test(item))) return [];
  return items.map((item) => `${base}${item}${WILDCARD_EXTENSION}`);
}

function treePaths(claudeMd: string): string[] {
  const parents: (string | null)[] = []; // carpeta de cada nivel; null si su línea no es una sola carpeta
  const result = new Set<string>();
  treeLines(claudeMd).forEach((line, index) => {
    const match = /^((?:│ {3}| {4})*)[├└]── (.+)$/.exec(line);
    if (match === null) throw new Error(`Árbol de CLAUDE.md, línea ${index + 1}: no tiene forma de rama: ${line}`);
    const [, indent = '', rest = ''] = match;
    const depth = indent.length / 4;
    const parent = depth === 0 ? '' : parents[depth - 1];
    if (parent === undefined || parent === null) throw new Error(`Árbol de CLAUDE.md, línea ${index + 1}: no sé de qué carpeta cuelga`);
    const hash = rest.search(/\s#\s/);
    const comment = hash === -1 ? '' : rest.slice(hash).replace(/^\s+#\s/, '');
    const entries = pathsIn(hash === -1 ? rest : rest.slice(0, hash), parent, true);
    const only = entries.entries.length === 1 ? entries.entries[0] : undefined;
    const folder = only !== undefined && only.endsWith('/') ? only : null;
    parents.length = depth;
    parents.push(folder);
    const base = folder ?? parent;
    for (const found of [...entries.all, ...pathsIn(comment, base, false).all, ...namesIn(comment, base)]) result.add(found);
  });
  return [...result];
}

// Subconjunto de .gitignore: rutas literales, ancladas («/x», «x/y») o por nombre en cualquier nivel («x», «x/»).
// Los patrones con comodines o negación se saltan: una ruta que solo cubran ellos se comprueba igual.
function gitignored(gitignore: string): (relative: string) => boolean {
  const patterns = gitignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#') && !/[*?[!\\]/.test(line));
  return (relative) => {
    const clean = relative.replace(/\/$/, '');
    const segments = clean.split('/');
    return patterns.some((pattern) => {
      const bare = pattern.replace(/^\//, '').replace(/\/$/, '');
      const anchored = pattern.startsWith('/') || bare.includes('/');
      return anchored ? clean === bare || clean.startsWith(`${bare}/`) : segments.includes(bare);
    });
  };
}

function exists(root: string, relative: string): boolean {
  if (relative.endsWith(WILDCARD_EXTENSION)) {
    const name = relative.slice(0, -WILDCARD_EXTENSION.length);
    const folder = path.join(root, path.dirname(name));
    const base = path.basename(name);
    return existsSync(path.join(root, name)) || (existsSync(folder) && readdirSync(folder).some((file) => file.startsWith(`${base}.`)));
  }
  const full = path.join(root, relative);
  return existsSync(full) && (relative.endsWith('/') ? statSync(full).isDirectory() : statSync(full).isFile());
}

function missingPaths(root: string, claudeMd: string, gitignore: string): string[] {
  const ignored = gitignored(gitignore);
  return treePaths(claudeMd).filter((relative) => !ignored(relative) && !exists(root, relative));
}

const tree = (...lines: string[]) => ['# Título', '', '## Estructura', '', '```', ...lines, '```', ''].join('\n');

test('Seguridad: el analizador del árbol de CLAUDE.md saca carpetas, archivos y listas de nombres, y no las descripciones', () => {
  const sample = tree(
    '├── package.json · Dockerfile · docker-compose.yml (db, app) · .claude/ (agentes y settings.json: ver «Quién hace qué»)',
    '├── server/src/',
    '│   ├── app.ts · server.ts      # server.ts → server/dist/server.js',
    '│   ├── modules/                # auth, reading (RN-01–03, anuncios), admin',
    '│   │   └── auth/permissions.ts # ÚNICO archivo con las reglas de permisos',
    '│   ├── integrations/           # misma interfaz por driver: storage (local | r2), payments (fake | stripe)',
    '│   ├── db/                     # pool.ts (pool, withTransaction, Queryable), migrations/ (001_users … 009_billing)',
    '│   └── tests/                  # unit/ y api/: <tema>.test.ts',
    '├── client/',
    '│   └── public/                 # pages/<página>.html, styles/ (variables.css, components/), icons/ (logo e imagen Open Graph (`koma-og.png`))',
    '└── content/ · storage/         # obras a importar · imágenes del driver local (ignorados por git)',
  );
  assert.deepEqual(treePaths(sample), [
    'package.json',
    'Dockerfile',
    'docker-compose.yml',
    '.claude/',
    '.claude/settings.json',
    'server/src/',
    'server/src/app.ts',
    'server/src/server.ts',
    'server/src/modules/',
    'server/src/modules/auth.*',
    'server/src/modules/reading.*',
    'server/src/modules/admin.*',
    'server/src/modules/auth/permissions.ts',
    'server/src/integrations/',
    'server/src/integrations/storage.*',
    'server/src/integrations/payments.*',
    'server/src/db/',
    'server/src/db/pool.ts',
    'server/src/db/migrations/',
    'server/src/tests/',
    'server/src/tests/unit/',
    'server/src/tests/api/',
    'client/',
    'client/public/',
    'client/public/pages/',
    'client/public/styles/',
    'client/public/styles/variables.css',
    'client/public/styles/components/',
    'client/public/icons/',
    'client/public/icons/koma-og.png',
    'content/',
    'storage/',
  ]);
});

test('Seguridad: el árbol de CLAUDE.md marca lo que no existe y salta lo que ignora git', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'koma-claude-tree-'));
  try {
    for (const relative of ['README.md', 'Dockerfile', 'server/src/db/pool.ts', 'server/src/db/migrations/', 'server/src/modules/auth/', 'server/src/scripts/seed.ts', 'docs/']) {
      const full = path.join(root, relative);
      if (relative.endsWith('/')) mkdirSync(full, { recursive: true });
      else {
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, '');
      }
    }
    const sample = tree(
      '├── README.md · Dockerfile',
      '├── server/src/',
      '│   ├── db/                     # pool.ts, migrations/, seeds/',
      '│   ├── modules/                # auth, fantasma',
      '│   └── scripts/                # seed.ts, demo-activity.ts (idea 24)',
      '├── content/                    # obras a importar (ignorado por git)',
      '└── docs/                       # plan_mvp.md',
    );
    assert.deepEqual(missingPaths(root, sample, 'content/\nnode_modules/\n*.log\n'), [
      'server/src/db/seeds/',
      'server/src/modules/fantasma.*',
      'server/src/scripts/demo-activity.ts',
      'docs/plan_mvp.md',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Seguridad: sin el árbol de «## Estructura», el analizador falla en lugar de darlo por bueno', () => {
  assert.throws(() => treePaths('# CLAUDE.md\n\n## Comandos\n'), /Estructura/);
  assert.throws(() => treePaths(tree('server/src/ sin rama')), /forma de rama/);
  assert.throws(() => treePaths(tree('│   ├── huerfano.ts')), /cuelga/);
});

test('Seguridad: cada ruta del árbol de CLAUDE.md existe', () => {
  const claudeMd = readFileSync(path.join(paths.root, 'CLAUDE.md'), 'utf8');
  const gitignore = readFileSync(path.join(paths.root, '.gitignore'), 'utf8');
  assert.ok(treePaths(claudeMd).length >= 30, 'El árbol de CLAUDE.md debería nombrar decenas de rutas: ¿ha cambiado su formato?');
  const missing = missingPaths(paths.root, claudeMd, gitignore);
  assert.deepEqual(missing, [], `CLAUDE.md nombra rutas que no existen (corrige el árbol o crea el archivo): ${missing.join(', ')}`);
});
