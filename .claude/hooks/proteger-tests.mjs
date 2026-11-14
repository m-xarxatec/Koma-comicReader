#!/usr/bin/env node
// Hook PreToolUse «proteger-tests» (plan_limpieza.md, A5; CLAUDE.md, «Tests»).
//
// Bloquea (exit 2) que la IA modifique, mueva o borre un test existente de
// server/src/tests/, es decir, uno que ya está en el último commit (HEAD), y
// que cree, edite o borre .claude/permiso-tests.txt. Los tests nuevos, aún sin
// commit, se crean, se editan y se borran libremente.
// Excepción: los archivos que el desarrollador lista en .claude/permiso-tests.txt
// (una ruta por línea, relativa a la raíz; las líneas con # son comentarios).
//
// Edit, Write, MultiEdit y NotebookEdit se comprueban por ruta. Los comandos de
// Bash, PowerShell y Monitor se analizan de forma aproximada (redirecciones,
// sed -i, rm, mv, cp, git checkout/restore…, find -delete, xargs, bucles y
// código en línea): es una ayuda, no una garantía. La garantía es la
// comprobación de resultado del hook Stop (A7).
//
// Node sin dependencias, para Linux y Windows. Si algo falla por dentro,
// bloquea igualmente; settings.json añade onFailure: "block" para los fallos
// de arranque y de tiempo.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TESTS_DIR = 'server/src/tests';
const PERMISSION_FILE = '.claude/permiso-tests.txt';
const IS_WINDOWS = process.platform === 'win32';
const MAX_DEPTH = 6;

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'Monitor']);

const CD = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl']);
const WRITES_OPERANDS = new Set([
  'rm', 'unlink', 'shred', 'srm', 'rmdir', 'truncate', 'touch',
  'remove-item', 'ri', 'del', 'erase', 'rd', 'clear-content', 'clc',
  'set-content', 'sc', 'add-content', 'ac', 'out-file', 'new-item', 'ni',
]);
const MOVES = new Set(['mv', 'move', 'move-item', 'mi', 'rename-item', 'ren', 'rni', 'rename']);
const COPIES = new Set(['cp', 'copy', 'copy-item', 'cpi', 'install', 'rsync', 'ln']);
const POSIX_SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish']);
const OTHER_SHELLS = new Set(['pwsh', 'powershell', 'cmd']);
const INLINE_FLAGS = new Map([
  ['node', ['-e', '--eval', '-p', '--print']],
  ['bun', ['-e', '--eval']],
  ['tsx', ['-e', '--eval']],
  ['ts-node', ['-e', '--eval']],
  ['deno', ['eval']],
  ['python', ['-c']],
  ['python3', ['-c']],
  ['py', ['-c']],
  ['ruby', ['-e']],
  ['perl', ['-e', '-E']],
  ['php', ['-r']],
]);
const GIT_WRITES = new Set([
  'checkout', 'restore', 'rm', 'mv', 'reset', 'stash', 'clean', 'switch', 'apply', 'am',
  'merge', 'pull', 'rebase', 'cherry-pick', 'revert', 'read-tree', 'checkout-index', 'update-index',
]);
const FIX_FLAGS = new Set(['--write', '--fix', '--in-place']);
const PREFIXES = new Set([
  'sudo', 'doas', 'nohup', 'time', 'command', 'builtin', 'exec', 'env', 'stdbuf',
  'then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}',
]);
const PREFIXES_WITH_FLAGS = new Set(['sudo', 'doas', 'env', 'stdbuf', 'command', 'exec']);
const WRITE_REDIRECTS = new Set(['>', '>>', '>|', '&>', '&>>', '<>']);
const WRITE_API =
  /write|append|unlink|\brm\b|rmSync|rmdir|rename|truncate|copy|move|remove|delete|createWriteStream|set-content|out-file|add-content|open\([^)]*,\s*['"][^'"]*[wax+]/i;

const RULE = [
  'Regla (CLAUDE.md, «Tests»): los tests existentes de server/src/tests/ (los que ya están en un commit, también helpers.ts y reading-fixtures.ts) no se modifican, no se mueven ni se borran. Crear tests nuevos sí está permitido.',
  'Excepción: solo si un cambio de contrato aprobado lo exige. Para, explica al desarrollador qué aserción cambia y por qué, y espera su permiso. Él lista el archivo en .claude/permiso-tests.txt (una ruta por línea, relativa a la raíz) y tú lo anotas en docs/bitacora.md.',
  'No intentes rodear este candado: si te para, detente y avisa.',
].join('\n');
const PERMISSION_RULE =
  '.claude/permiso-tests.txt es solo del desarrollador: la IA no lo crea, no lo edita ni lo borra. Si hace falta una excepción, pídesela a él.';

let projectRoot = '';
const violations = [];
const trackedCache = new Map();
const permittedCache = new Map();

// ---------- Rutas ----------

const toSlash = (p) => p.replaceAll('\\', '/');
const toKey = (p) => (IS_WINDOWS ? p.toLowerCase() : p);

function stripTrailing(p) {
  if (p === '/' || /^[A-Za-z]:\/$/.test(p)) return p;
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

function absolute(base, p) {
  let q = toSlash(p);
  if (IS_WINDOWS && /^\/[A-Za-z]\//.test(q)) q = `${q[1]}:${q.slice(2)}`; // /c/proyecto (Git Bash)
  return stripTrailing(toSlash(path.resolve(base, q)));
}

function relInside(root, abs) {
  const r = toKey(root);
  const a = toKey(abs);
  if (a === r) return '';
  const prefix = r.endsWith('/') ? r : `${r}/`;
  return a.startsWith(prefix) ? abs.slice(prefix.length) : null;
}

const covers = (dirKey, fileKey) => dirKey === '' || fileKey === dirKey || fileKey.startsWith(`${dirKey}/`);

function couldCoverTests(relKey) {
  const t = toKey(TESTS_DIR);
  return covers(relKey, t) || relKey.startsWith(`${t}/`);
}

function isDirectory(abs) {
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

// La raíz y la ruta relativa de un archivo dentro del proyecto o de otra copia
// del proyecto (worktree, carpeta adicional), que se protege igual.
function locate(abs) {
  const rel = relInside(projectRoot, abs);
  if (rel !== null) return { root: projectRoot, rel };
  const k = toKey(abs);
  const marker = `/${toKey(TESTS_DIR)}`;
  let i = k.indexOf(`${marker}/`);
  if (i === -1 && k.endsWith(marker)) i = k.length - marker.length;
  if (i <= 0) return null;
  return { root: abs.slice(0, i), rel: abs.slice(i + 1) };
}

// Tests versionados en HEAD; null si git no responde (se usa el disco).
function trackedTests(root) {
  const k = toKey(root);
  if (!trackedCache.has(k)) {
    let list = null;
    try {
      const out = execFileSync('git', ['-C', root, 'ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', TESTS_DIR], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
        windowsHide: true,
      });
      list = out.split('\0').filter(Boolean);
    } catch {
      list = null;
    }
    trackedCache.set(k, list);
  }
  return trackedCache.get(k);
}

function permittedTests(root) {
  const k = toKey(root);
  if (!permittedCache.has(k)) {
    const set = new Set();
    let text = '';
    try {
      text = readFileSync(path.join(root, PERMISSION_FILE), 'utf8');
    } catch {
      text = '';
    }
    for (const line of text.split(/\r?\n/)) {
      const entry = stripTrailing(toSlash(line.trim()).replace(/^\.\//, ''));
      if (entry && !entry.startsWith('#')) set.add(toKey(entry));
    }
    permittedCache.set(k, set);
  }
  return permittedCache.get(k);
}

// Archivos protegidos que quedan bajo abs (el propio archivo, una carpeta o un antepasado).
function protectedUnder(abs) {
  const found = [];
  const permissionAbs = `${projectRoot}/${PERMISSION_FILE}`;
  if (toKey(abs).endsWith(`/${toKey(PERMISSION_FILE)}`)) {
    found.push({ kind: 'permission', label: PERMISSION_FILE, abs });
  } else if (relInside(abs, permissionAbs) !== null && existsSync(permissionAbs)) {
    found.push({ kind: 'permission', label: PERMISSION_FILE, abs: permissionAbs });
  }
  const loc = locate(abs);
  if (!loc || !couldCoverTests(toKey(loc.rel))) return found;
  const tracked = trackedTests(loc.root);
  const permitted = permittedTests(loc.root);
  const show = (rel) => (loc.root === projectRoot ? rel : `${loc.root}/${rel}`);
  if (tracked) {
    for (const t of tracked) {
      if (covers(toKey(loc.rel), toKey(t)) && !permitted.has(toKey(t))) {
        found.push({ kind: 'test', label: show(t), abs: `${loc.root}/${t}` });
      }
    }
  } else if (existsSync(abs) && !permitted.has(toKey(loc.rel))) {
    found.push({ kind: 'test', label: show(loc.rel || '.'), abs });
  }
  return found;
}

function globToRegExp(pattern, slashAware = true) {
  const any = slashAware ? '[^/]*' : '.*';
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i++;
        if (pattern[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += any;
      }
    } else if (c === '?') {
      re += slashAware ? '[^/]' : '.';
    } else if (c === '[') {
      const end = pattern.indexOf(']', i + 2);
      if (end === -1) {
        re += '\\[';
      } else {
        let cls = pattern.slice(i + 1, end).replaceAll('\\', '\\\\');
        if (cls.startsWith('!')) cls = `^${cls.slice(1)}`;
        re += `[${cls}]`;
        i = end;
      }
    } else {
      re += c.replace(/[.+^${}()|\\/]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`, IS_WINDOWS ? 'i' : '');
}

// abs y sus carpetas antepasadas, sin llegar a stop.
function chain(abs, stop) {
  const out = [abs];
  const stopLength = toKey(stop).length;
  let current = abs;
  for (;;) {
    const i = current.lastIndexOf('/');
    if (i <= 0) break;
    current = current.slice(0, i);
    if (current.length <= stopLength) break;
    out.push(current);
  }
  return out;
}

function protectedByGlob(absPattern) {
  const literal = absPattern.slice(0, absPattern.search(/[*?[]/));
  const baseDir = stripTrailing(literal.slice(0, literal.lastIndexOf('/') + 1)) || '/';
  const re = globToRegExp(absPattern);
  return protectedUnder(baseDir).filter((f) => chain(f.abs, baseDir).some((p) => re.test(p)));
}

// ---------- Palabras de un comando ----------

function expand(word, cwd) {
  if (/\$\(|`|[<>]\(/.test(word)) return null;
  let w = word;
  if (w === '~' || /^~[/\\]/.test(w)) w = os.homedir() + w.slice(1);
  const env = (name) => (name === 'PWD' ? cwd : process.env[name]);
  w = w
    .replace(/\$env:([A-Za-z_]\w*)/gi, (m, n) => env(n) ?? m)
    .replace(/\$\{([A-Za-z_]\w*)\}/g, (m, n) => env(n) ?? m)
    .replace(/\$([A-Za-z_]\w*)/g, (m, n) => env(n) ?? m)
    .replace(/%([A-Za-z_]\w*)%/g, (m, n) => env(n) ?? m);
  return w.includes('$') ? null : w;
}

// Sustituye las variables de bucles (for x in …) y asignaciones vistas antes.
function withVariableValues(word, ctx, depth = 0) {
  const m = word.match(/\$\{?([A-Za-z_]\w*)\}?/);
  if (!m || !ctx.vars.has(m[1]) || depth > 3) return [word];
  return ctx.vars.get(m[1]).flatMap((value) => withVariableValues(word.replace(m[0], value), ctx, depth + 1));
}

function checkPath(word, ctx, how) {
  for (const candidate of withVariableValues(word, ctx)) {
    const expanded = expand(candidate, ctx.cwd);
    if (expanded === null || expanded === '' || expanded === '-') continue;
    if (/^(\/dev\/(null|stdout|stderr|tty)|nul)$/i.test(expanded)) continue;
    const abs = absolute(ctx.cwd, expanded);
    const found = /[*?[]/.test(expanded) ? protectedByGlob(abs) : protectedUnder(abs);
    for (const f of found) violations.push({ ...f, how });
  }
}

function operands(args) {
  const out = [];
  let rest = false;
  for (const a of args) {
    if (rest) out.push(a);
    else if (a === '--') rest = true;
    else if (!a.startsWith('-') || a === '-') out.push(a);
  }
  return out;
}

function programName(word) {
  const base = toSlash(word).split('/').pop() ?? '';
  return base.toLowerCase().replace(/\.(exe|cmd|bat|com)$/, '');
}

function stripPrefixes(words) {
  let k = 0;
  while (k < words.length) {
    const w = words[k];
    if (/^[A-Za-z_]\w*=/.test(w)) {
      k++;
      continue;
    }
    const p = programName(w);
    if (p === 'timeout') {
      k++;
      while (k < words.length && words[k].startsWith('-')) k++;
      k++; // duración
      continue;
    }
    if (p === 'nice') {
      k++;
      if (words[k] === '-n') k += 2;
      else if (/^-\d+$/.test(words[k] ?? '')) k++;
      continue;
    }
    if (!PREFIXES.has(p)) break;
    k++;
    if (PREFIXES_WITH_FLAGS.has(p)) while (k < words.length && words[k].startsWith('-')) k++;
  }
  return words.slice(k);
}

const hasInPlaceFlag = (prog, args) => {
  const short = prog === 'sed' ? /^-[nErsuz]*i/ : /^-[aFlnpsuwWX0-9]*i/;
  return args.some((a) => a.startsWith('--in-place') || short.test(a));
};

function isWriteInvocation(prog, args) {
  if (WRITES_OPERANDS.has(prog) || MOVES.has(prog) || COPIES.has(prog) || prog === 'tee' || prog === 'dd') return true;
  if ((prog === 'sed' || prog === 'perl') && hasInPlaceFlag(prog, args)) return true;
  if (prog === 'git') return args.some((a) => GIT_WRITES.has(a));
  if (POSIX_SHELLS.has(prog) || OTHER_SHELLS.has(prog) || prog === 'eval' || INLINE_FLAGS.has(prog)) return true;
  return args.some((a) => FIX_FLAGS.has(a.split('=')[0]));
}

// ---------- Análisis léxico (aproximado: bash y PowerShell) ----------

function matchingParen(src, open) {
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') {
      j++;
    } else if (c === "'") {
      const e = src.indexOf("'", j + 1);
      if (e === -1) return src.length;
      j = e;
    } else if (c === '"') {
      let e = j + 1;
      while (e < src.length && src[e] !== '"') e += src[e] === '\\' ? 2 : 1;
      j = e;
    } else if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0) return j;
    }
  }
  return src.length;
}

function lex(src) {
  const segments = [];
  const substitutions = [];
  const heredocQueue = [];
  let pipeline = 0;
  let word = '';
  let inWord = false;
  let pendingRedirect = null;
  let pendingHeredoc = null;
  const newSegment = () => ({ words: [], redirects: [], heredocs: [], pipeline });
  let seg = newSegment();

  const endWord = () => {
    if (!inWord) return;
    if (pendingRedirect) {
      seg.redirects.push({ op: pendingRedirect, target: word });
      pendingRedirect = null;
    } else if (pendingHeredoc) {
      heredocQueue.push({ delim: word, strip: pendingHeredoc.strip, seg });
      pendingHeredoc = null;
    } else {
      seg.words.push(word);
    }
    word = '';
    inWord = false;
  };
  const endSegment = (samePipeline) => {
    endWord();
    pendingRedirect = null;
    pendingHeredoc = null;
    if (seg.words.length || seg.redirects.length) segments.push(seg);
    if (!samePipeline) pipeline++;
    seg = newSegment();
  };
  const substitution = (start, open) => {
    const end = matchingParen(src, open);
    substitutions.push(src.slice(open + 1, end));
    word += src.slice(start, end + 1);
    inWord = true;
    return end;
  };
  const consumeHeredocs = (newline) => {
    let pos = newline + 1;
    while (heredocQueue.length) {
      const { delim, strip, seg: target } = heredocQueue.shift();
      const lines = [];
      while (pos < src.length) {
        let end = src.indexOf('\n', pos);
        if (end === -1) end = src.length;
        const line = src.slice(pos, end);
        pos = end + 1;
        const compared = (strip ? line.replace(/^\t+/, '') : line).replace(/\r$/, '');
        if (compared === delim) break;
        lines.push(line);
      }
      target.heredocs.push(lines.join('\n'));
    }
    return Math.min(pos, src.length) - 1;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '\n') {
      endSegment(false);
      i = consumeHeredocs(i);
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
    } else if (c === '#' && !inWord) {
      const e = src.indexOf('\n', i);
      if (e === -1) break;
      i = e - 1;
    } else if (c === "'") {
      const e = src.indexOf("'", i + 1);
      const end = e === -1 ? src.length : e;
      word += src.slice(i + 1, end);
      inWord = true;
      i = end;
    } else if (c === '"') {
      inWord = true;
      let j = i + 1;
      for (; j < src.length && src[j] !== '"'; j++) {
        const d = src[j];
        if (d === '\\' && '"\\$`'.includes(src[j + 1] ?? '')) {
          word += src[j + 1];
          j++;
        } else if (d === '$' && src[j + 1] === '(') {
          j = substitution(j, j + 1);
        } else if (d === '`') {
          const e = src.indexOf('`', j + 1);
          const end = e === -1 ? src.length : e;
          substitutions.push(src.slice(j + 1, end));
          word += src.slice(j, end + 1);
          j = end;
        } else {
          word += d;
        }
      }
      i = j;
    } else if (c === '\\') {
      if (n === '\n') {
        i++;
      } else if (n !== undefined && ' \t\'"\\$`;&|<>()#*?[]{}~!'.includes(n)) {
        word += n;
        inWord = true;
        i++;
      } else {
        word += '\\'; // ruta de Windows: la barra se queda
        inWord = true;
      }
    } else if (c === '$' && n === '(') {
      i = substitution(i, i + 1);
    } else if ((c === '<' || c === '>') && n === '(') {
      i = substitution(i, i + 1);
    } else if (c === '`') {
      const e = src.indexOf('`', i + 1);
      const end = e === -1 ? src.length : e;
      substitutions.push(src.slice(i + 1, end));
      word += src.slice(i, end + 1);
      inWord = true;
      i = end;
    } else if (c === ';') {
      endSegment(false);
      if (n === ';') i++;
    } else if (c === '&') {
      if (n === '&') {
        endSegment(false);
        i++;
      } else if (n === '>') {
        endWord();
        const append = src[i + 2] === '>';
        pendingRedirect = append ? '&>>' : '&>';
        i += append ? 2 : 1;
      } else {
        endSegment(false);
      }
    } else if (c === '|') {
      if (n === '|') {
        endSegment(false);
        i++;
      } else {
        endSegment(true);
        if (n === '&') i++;
      }
    } else if (c === '>') {
      if (inWord && /^(\d+|\*)$/.test(word)) {
        word = '';
        inWord = false;
      } else {
        endWord();
      }
      let op = '>';
      if (n === '>') {
        op = '>>';
        i++;
      } else if (n === '|') {
        op = '>|';
        i++;
      }
      if (src[i + 1] === '&') {
        i++;
        let j = i + 1;
        while (j < src.length && /[0-9-]/.test(src[j])) j++;
        if (j > i + 1) {
          i = j - 1; // >&2, 2>&1: duplicación, sin archivo
          continue;
        }
      }
      pendingRedirect = op;
    } else if (c === '<') {
      endWord();
      if (n === '<') {
        if (src[i + 2] === '<') {
          i += 2;
          pendingRedirect = '<<<';
        } else {
          const strip = src[i + 2] === '-';
          i += strip ? 2 : 1;
          pendingHeredoc = { strip };
        }
      } else if (n === '>') {
        i++;
        pendingRedirect = '<>';
      } else {
        pendingRedirect = '<';
      }
    } else if (c === '(' && !inWord) {
      endSegment(false);
    } else if (c === ')') {
      endSegment(false);
    } else {
      word += c;
      inWord = true;
    }
  }
  endSegment(false);
  return { segments, substitutions };
}

// ---------- Análisis de comandos ----------

const child = (ctx) => ({ cwd: ctx.cwd, vars: new Map(ctx.vars) });

function analyzeCommand(src, ctx, depth) {
  if (depth > MAX_DEPTH) return;
  const { segments, substitutions } = lex(src);
  for (const s of substitutions) analyzeCommand(s, child(ctx), depth + 1);
  const pipelines = new Map();
  for (const seg of segments) {
    if (!pipelines.has(seg.pipeline)) pipelines.set(seg.pipeline, []);
    pipelines.get(seg.pipeline).push(seg);
  }
  for (const seg of segments) analyzeSegment(seg, ctx, depth, pipelines.get(seg.pipeline));
}

function analyzeSegment(seg, ctx, depth, pipeline) {
  for (const r of seg.redirects) {
    if (WRITE_REDIRECTS.has(r.op)) checkPath(r.target, ctx, `redirección ${r.op}`);
  }
  const words = seg.words;
  if (words[0] === 'for' && words[2] === 'in') {
    ctx.vars.set(words[1], words.slice(3).filter((w) => w !== 'do'));
    return;
  }
  if (words.length && words.every((w) => /^[A-Za-z_]\w*=/.test(w))) {
    for (const w of words) {
      const eq = w.indexOf('=');
      ctx.vars.set(w.slice(0, eq), [w.slice(eq + 1)]);
    }
    return;
  }
  const rest = stripPrefixes(words);
  if (rest.length) analyzeInvocation(programName(rest[0]), rest.slice(1), ctx, depth, seg, pipeline);
}

function analyzeInvocation(prog, args, ctx, depth, seg, pipeline) {
  if (CD.has(prog)) {
    const dir = operands(args)[0];
    if (dir === undefined) {
      ctx.cwd = toSlash(os.homedir());
    } else {
      const e = expand(dir, ctx.cwd);
      if (e !== null && e !== '-') ctx.cwd = absolute(ctx.cwd, e);
    }
    return;
  }
  if (WRITES_OPERANDS.has(prog)) {
    for (const a of operands(args)) checkPath(a, ctx, prog);
    return;
  }
  if (MOVES.has(prog) || COPIES.has(prog)) {
    checkTransfer(prog, args, ctx);
    return;
  }
  if ((prog === 'sed' || prog === 'perl') && hasInPlaceFlag(prog, args)) {
    for (const a of operands(args)) checkPath(a, ctx, `${prog} -i`);
    return;
  }
  if (prog === 'tee') {
    for (const a of operands(args)) checkPath(a, ctx, 'tee');
    return;
  }
  if (prog === 'dd') {
    for (const a of args) if (a.startsWith('of=')) checkPath(a.slice(3), ctx, 'dd');
    return;
  }
  if (prog === 'git') {
    checkGit(args, ctx);
    return;
  }
  if (prog === 'find') {
    checkFind(args, ctx);
    return;
  }
  if (prog === 'xargs') {
    checkXargs(args, ctx, depth, seg, pipeline);
    return;
  }
  if (prog === 'eval') {
    analyzeCommand(args.join(' '), child(ctx), depth + 1);
    return;
  }
  if (POSIX_SHELLS.has(prog) || OTHER_SHELLS.has(prog)) {
    const code = shellCode(prog, args);
    if (code !== null) analyzeCommand(code, child(ctx), depth + 1);
    for (const body of seg?.heredocs ?? []) analyzeCommand(body, child(ctx), depth + 1);
    return;
  }
  if (INLINE_FLAGS.has(prog)) {
    checkInlineCode(prog, args, ctx, seg);
    return;
  }
  const fix = args.find((a) => FIX_FLAGS.has(a.split('=')[0]));
  if (fix) for (const a of operands(args)) checkPath(a, ctx, `${prog} ${fix}`);
}

function checkTransfer(prog, args, ctx) {
  const sources = [];
  let target = null;
  let rest = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (!rest) {
      if (a === '--') {
        rest = true;
        continue;
      }
      if (a === '-t' || a === '--target-directory' || /^-destination$/i.test(a)) {
        target = args[++k] ?? null;
        continue;
      }
      if (a.startsWith('--target-directory=')) {
        target = a.slice('--target-directory='.length);
        continue;
      }
      if (a.startsWith('-') && a !== '-') continue;
    }
    sources.push(a);
  }
  if (target === null && sources.length >= 2) target = sources.pop();
  if (MOVES.has(prog)) for (const s of sources) checkPath(s, ctx, prog);
  if (target === null) return;
  for (const t of withVariableValues(target, ctx)) {
    const e = expand(t, ctx.cwd);
    if (e === null) continue;
    const absTarget = absolute(ctx.cwd, e);
    if (isDirectory(absTarget) && sources.length) {
      for (const s of sources) checkPath(`${absTarget}/${path.posix.basename(toSlash(s))}`, ctx, prog);
    } else {
      checkPath(absTarget, ctx, prog);
    }
  }
}

function checkGit(args, ctx) {
  let base = ctx.cwd;
  let k = 0;
  while (k < args.length && args[k].startsWith('-')) {
    const a = args[k];
    if (a === '-C') {
      const e = expand(args[k + 1] ?? '', base);
      if (e) base = absolute(base, e);
      k += 2;
    } else if (['-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env'].includes(a)) {
      k += 2;
    } else {
      k++;
    }
  }
  const sub = args[k];
  if (sub === undefined || !GIT_WRITES.has(sub)) return;
  const gitCtx = { cwd: base, vars: ctx.vars };
  for (const a of operands(args.slice(k + 1))) {
    checkPath(a.startsWith(':/') ? `${projectRoot}/${a.slice(2)}` : a, gitCtx, `git ${sub}`);
  }
}

function checkFind(args, ctx) {
  let k = 0;
  while (k < args.length && /^-[HLPDO]/.test(args[k])) k += args[k] === '-D' ? 2 : 1;
  const starts = [];
  while (k < args.length && !args[k].startsWith('-') && args[k] !== '(' && args[k] !== '!') starts.push(args[k++]);
  if (!starts.length) starts.push('.');
  const names = [];
  const paths = [];
  let destructive = false;
  for (let j = k; j < args.length; j++) {
    const a = args[j];
    if (a === '-delete') {
      destructive = true;
    } else if ((a === '-name' || a === '-iname') && args[j + 1] !== undefined) {
      names.push(args[++j]);
    } else if (['-path', '-ipath', '-wholename', '-iwholename'].includes(a) && args[j + 1] !== undefined) {
      paths.push(args[++j]);
    } else if (['-exec', '-execdir', '-ok', '-okdir'].includes(a)) {
      let end = j + 1;
      while (end < args.length && args[end] !== ';' && args[end] !== '+') end++;
      const inner = args.slice(j + 1, end);
      if (inner.length && isWriteInvocation(programName(inner[0]), inner.slice(1))) destructive = true;
      j = end;
    }
  }
  if (!destructive) return;
  for (const start of starts) {
    const e = expand(start, ctx.cwd);
    if (e === null) continue;
    const startAbs = absolute(ctx.cwd, e);
    const shownStart = stripTrailing(toSlash(e));
    for (const f of protectedUnder(startAbs)) {
      if (names.length || paths.length) {
        const hit = chain(f.abs, startAbs).some((p) => {
          const base = p.slice(p.lastIndexOf('/') + 1);
          const shown = shownStart + p.slice(startAbs.length);
          return (
            names.some((pattern) => globToRegExp(pattern).test(base)) ||
            paths.some((pattern) => globToRegExp(pattern, false).test(shown))
          );
        });
        if (!hit) continue;
      }
      violations.push({ ...f, how: 'find' });
    }
  }
}

function checkXargs(args, ctx, depth, seg, pipeline) {
  const withValue = new Set([
    '-I', '-n', '-P', '-d', '-L', '-s', '-E', '-a',
    '--max-args', '--max-procs', '--delimiter', '--arg-file', '--max-lines', '--max-chars', '--eof',
  ]);
  let k = 0;
  while (k < args.length && args[k].startsWith('-')) k += withValue.has(args[k]) ? 2 : 1;
  const inner = stripPrefixes(args.slice(k));
  if (!inner.length) return;
  const prog = programName(inner[0]);
  analyzeInvocation(prog, inner.slice(1), ctx, depth + 1, null, null);
  if (!isWriteInvocation(prog, inner.slice(1))) return;
  // Las rutas llegan por la tubería: se buscan en el resto de la tubería.
  for (const other of pipeline ?? []) {
    if (other === seg) continue;
    for (const w of stripPrefixes(other.words).slice(1)) {
      if (!w.startsWith('-')) checkPath(w, ctx, `xargs ${prog}`);
    }
  }
}

function shellCode(prog, args) {
  if (POSIX_SHELLS.has(prog)) {
    const k = args.findIndex((a) => /^-[a-z]*c$/.test(a));
    return k === -1 ? null : (args[k + 1] ?? null);
  }
  const flag = prog === 'cmd' ? /^\/[ck]$/i : /^-(c|command)$/i;
  const k = args.findIndex((a) => flag.test(a));
  return k === -1 ? null : args.slice(k + 1).join(' ');
}

function checkInlineCode(prog, args, ctx, seg) {
  const flags = INLINE_FLAGS.get(prog);
  const pieces = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (flags.includes(a)) {
      if (args[k + 1] !== undefined) pieces.push(args[k + 1]);
      k++;
      continue;
    }
    const long = flags.find((f) => f.startsWith('--') && a.startsWith(`${f}=`));
    if (long) pieces.push(a.slice(long.length + 1));
  }
  for (const body of seg?.heredocs ?? []) pieces.push(body);
  for (const code of pieces) scanCode(code, ctx, prog);
}

function scanCode(code, ctx, prog) {
  const cleaned = code.replace(/\b(?:process|sys)\.std(?:out|err)\.write\b/g, '');
  if (!WRITE_API.test(cleaned)) return;
  for (const candidate of cleaned.match(/[\w.~/\\:-]+/g) ?? []) {
    if (/^[.~/\\:-]*$/.test(candidate)) continue;
    if (!/[/\\]/.test(candidate) && !/\.\w+$/.test(candidate)) continue;
    checkPath(candidate, ctx, `${prog} (código en línea)`);
  }
}

// ---------- Entrada y salida ----------

function report() {
  const tests = [...new Map(violations.filter((v) => v.kind === 'test').map((v) => [v.label, v])).values()];
  const permission = violations.find((v) => v.kind === 'permission');
  const lines = [];
  if (tests.length) {
    const names = tests.slice(0, 5).map((v) => v.label).join(', ');
    const more = tests.length > 5 ? ` y ${tests.length - 5} más` : '';
    const what = tests.length === 1 ? 'un test existente' : `${tests.length} tests existentes`;
    lines.push(`proteger-tests: bloqueado (${tests[0].how}). Tocaría ${what}: ${names}${more}.`, RULE);
  }
  if (permission) lines.push(`proteger-tests: bloqueado (${permission.how}). ${PERMISSION_RULE}`);
  process.stderr.write(`${lines.join('\n')}\n`);
  process.exitCode = 2;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw);
  const tool = input?.tool_name;
  const toolInput = input?.tool_input;
  if (typeof tool !== 'string' || toolInput === null || typeof toolInput !== 'object') {
    throw new Error('la entrada no trae tool_name o tool_input');
  }
  const cwd = absolute(process.cwd(), typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd());
  projectRoot = absolute(cwd, process.env.CLAUDE_PROJECT_DIR || path.resolve(import.meta.dirname, '..', '..'));

  if (FILE_TOOLS.has(tool)) {
    const filePath = toolInput.file_path ?? toolInput.notebook_path;
    if (typeof filePath !== 'string' || filePath === '') throw new Error(`${tool} sin file_path`);
    for (const f of protectedUnder(absolute(cwd, filePath))) violations.push({ ...f, how: tool });
  } else if (SHELL_TOOLS.has(tool)) {
    const command = toolInput.command;
    if (typeof command !== 'string') {
      if (tool === 'Monitor') return;
      throw new Error(`${tool} sin command`);
    }
    analyzeCommand(command, { cwd, vars: new Map() }, 0);
  } else {
    return;
  }
  if (violations.length) report();
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `proteger-tests: error interno del hook (${message}). Se bloquea por precaución. Avisa al desarrollador: la desactivación de emergencia es suya (/hooks o .claude/settings.json).\n`,
  );
  process.exitCode = 2;
}
