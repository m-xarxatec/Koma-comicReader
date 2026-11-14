// Módulo compartido de los hooks de .claude/hooks/ (no es un hook): rutas,
// globs y un análisis aproximado de comandos de bash y PowerShell.
//
// Lo cargan los hooks con import() dinámico: si este archivo falta o no carga,
// el hook bloquea con un mensaje claro en lugar de dejar pasar.
//
// walkCommand(src, cwd, rules) recorre el comando: comillas, heredocs,
// tuberías, sustituciones $(…), cd, bucles for, asignaciones, prefijos
// (sudo, timeout…), bash -c, pwsh -Command, cmd /c y eval. Cada hook pone sus
// reglas en rules: segment(seg, ctx), redirect(r, ctx) e
// invocation(prog, args, ctx, info).

import { statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const IS_WINDOWS = process.platform === 'win32';
const MAX_DEPTH = 6;

const CD = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl']);
export const POSIX_SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish']);
export const OTHER_SHELLS = new Set(['pwsh', 'powershell', 'cmd']);
export const INLINE_FLAGS = new Map([
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
const PREFIXES = new Set([
  'sudo', 'doas', 'nohup', 'time', 'command', 'builtin', 'exec', 'env', 'stdbuf',
  'then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}',
]);
const PREFIXES_WITH_FLAGS = new Set(['sudo', 'doas', 'env', 'stdbuf', 'command', 'exec']);

// ---------- Rutas ----------

export const toSlash = (p) => p.replaceAll('\\', '/');
export const toKey = (p) => (IS_WINDOWS ? p.toLowerCase() : p);

export function stripTrailing(p) {
  if (p === '/' || /^[A-Za-z]:\/$/.test(p)) return p;
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

export function absolute(base, p) {
  let q = toSlash(p);
  if (IS_WINDOWS && /^\/[A-Za-z]\//.test(q)) q = `${q[1]}:${q.slice(2)}`; // /c/proyecto (Git Bash)
  return stripTrailing(toSlash(path.resolve(base, q)));
}

export function relInside(root, abs) {
  const r = toKey(root);
  const a = toKey(abs);
  if (a === r) return '';
  const prefix = r.endsWith('/') ? r : `${r}/`;
  return a.startsWith(prefix) ? abs.slice(prefix.length) : null;
}

export function isDirectory(abs) {
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

export function globToRegExp(pattern, slashAware = true) {
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
export function chain(abs, stop) {
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

// ---------- Palabras de un comando ----------

export function expand(word, cwd) {
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
export function withVariableValues(word, ctx, depth = 0) {
  const m = word.match(/\$\{?([A-Za-z_]\w*)\}?/);
  if (!m || !ctx.vars.has(m[1]) || depth > 3) return [word];
  return ctx.vars.get(m[1]).flatMap((value) => withVariableValues(word.replace(m[0], value), ctx, depth + 1));
}

// Rutas absolutas a las que puede referirse una palabra; vacío si no se puede saber.
export function resolveWord(word, ctx) {
  const out = [];
  for (const candidate of withVariableValues(word, ctx)) {
    const expanded = expand(candidate, ctx.cwd);
    if (expanded === null || expanded === '' || expanded === '-') continue;
    if (/^(\/dev\/(null|stdout|stderr|tty)|nul)$/i.test(expanded)) continue;
    out.push({ abs: absolute(ctx.cwd, expanded), glob: /[*?[]/.test(expanded) });
  }
  return out;
}

export function operands(args) {
  const out = [];
  let rest = false;
  for (const a of args) {
    if (rest) out.push(a);
    else if (a === '--') rest = true;
    else if (!a.startsWith('-') || a === '-') out.push(a);
  }
  return out;
}

export function programName(word) {
  const base = toSlash(word).split('/').pop() ?? '';
  return base.toLowerCase().replace(/\.(exe|cmd|bat|com)$/, '');
}

export function stripPrefixes(words) {
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

export function shellCode(prog, args) {
  if (POSIX_SHELLS.has(prog)) {
    const k = args.findIndex((a) => /^-[a-z]*c$/.test(a));
    return k === -1 ? null : (args[k + 1] ?? null);
  }
  const flag = prog === 'cmd' ? /^\/[ck]$/i : /^-(c|command)$/i;
  const k = args.findIndex((a) => flag.test(a));
  return k === -1 ? null : args.slice(k + 1).join(' ');
}

// Código en línea de un intérprete (node -e, python -c…) y heredocs que recibe.
export function inlineCode(prog, args, seg) {
  const flags = INLINE_FLAGS.get(prog);
  if (!flags) return [];
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
  return pieces;
}

// Trozos de código que parecen rutas.
export function codePathCandidates(code) {
  return (code.match(/[\w.~/\\:-]+/g) ?? []).filter(
    (c) => !/^[.~/\\:-]*$/.test(c) && (/[/\\]/.test(c) || /\.\w+$/.test(c)),
  );
}

// La orden que ejecuta xargs (sin sus opciones ni prefijos).
export function xargsCommand(args) {
  const withValue = new Set([
    '-I', '-n', '-P', '-d', '-L', '-s', '-E', '-a',
    '--max-args', '--max-procs', '--delimiter', '--arg-file', '--max-lines', '--max-chars', '--eof',
  ]);
  let k = 0;
  while (k < args.length && args[k].startsWith('-')) k += withValue.has(args[k]) ? 2 : 1;
  return stripPrefixes(args.slice(k));
}

export function parseFind(args) {
  let k = 0;
  while (k < args.length && /^-[HLPDO]/.test(args[k])) k += args[k] === '-D' ? 2 : 1;
  const starts = [];
  while (k < args.length && !args[k].startsWith('-') && args[k] !== '(' && args[k] !== '!') starts.push(args[k++]);
  if (!starts.length) starts.push('.');
  const names = [];
  const paths = [];
  const execs = [];
  let deletes = false;
  for (let j = k; j < args.length; j++) {
    const a = args[j];
    if (a === '-delete') {
      deletes = true;
    } else if ((a === '-name' || a === '-iname') && args[j + 1] !== undefined) {
      names.push(args[++j]);
    } else if (['-path', '-ipath', '-wholename', '-iwholename'].includes(a) && args[j + 1] !== undefined) {
      paths.push(args[++j]);
    } else if (['-exec', '-execdir', '-ok', '-okdir'].includes(a)) {
      let end = j + 1;
      while (end < args.length && args[end] !== ';' && args[end] !== '+') end++;
      const inner = args.slice(j + 1, end);
      if (inner.length) execs.push([programName(inner[0]), inner.slice(1)]);
      j = end;
    }
  }
  return { starts, names, paths, execs, deletes };
}

// ¿Los filtros -name/-path de find dejan pasar abs (o una carpeta suya) bajo startAbs?
export function findSelects(find, abs, startAbs, shownStart) {
  if (!find.names.length && !find.paths.length) return true;
  return chain(abs, startAbs).some((p) => {
    const base = p.slice(p.lastIndexOf('/') + 1);
    const shown = shownStart + p.slice(startAbs.length);
    return (
      find.names.some((pattern) => globToRegExp(pattern).test(base)) ||
      find.paths.some((pattern) => globToRegExp(pattern, false).test(shown))
    );
  });
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

export function lex(src) {
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

// ---------- Recorrido ----------

const child = (ctx) => ({ cwd: ctx.cwd, vars: new Map(ctx.vars) });

export function walkCommand(src, cwd, rules) {
  walk(src, { cwd, vars: new Map() }, 0, rules);
}

function walk(src, ctx, depth, rules) {
  if (depth > MAX_DEPTH) return;
  const { segments, substitutions } = lex(src);
  for (const s of substitutions) walk(s, child(ctx), depth + 1, rules);
  const pipelines = new Map();
  for (const seg of segments) {
    if (!pipelines.has(seg.pipeline)) pipelines.set(seg.pipeline, []);
    pipelines.get(seg.pipeline).push(seg);
  }
  for (const seg of segments) visitSegment(seg, ctx, depth, rules, pipelines.get(seg.pipeline));
}

function visitSegment(seg, ctx, depth, rules, pipeline) {
  rules.segment?.(seg, ctx);
  for (const r of seg.redirects) rules.redirect?.(r, ctx);
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
  if (rest.length) dispatch(programName(rest[0]), rest.slice(1), ctx, depth, rules, seg, pipeline);
}

function dispatch(prog, args, ctx, depth, rules, seg, pipeline) {
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
  if (prog === 'eval') {
    walk(args.join(' '), child(ctx), depth + 1, rules);
    return;
  }
  if (POSIX_SHELLS.has(prog) || OTHER_SHELLS.has(prog)) {
    const code = shellCode(prog, args);
    if (code !== null) walk(code, child(ctx), depth + 1, rules);
    for (const body of seg?.heredocs ?? []) walk(body, child(ctx), depth + 1, rules);
    return;
  }
  rules.invocation(prog, args, ctx, {
    seg,
    pipeline,
    // Para xargs: analiza la orden interior como una más.
    dispatch: (innerProg, innerArgs, innerCtx) => dispatch(innerProg, innerArgs, innerCtx, depth + 1, rules, null, null),
  });
}
