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
// Bash, PowerShell y Monitor se analizan de forma aproximada con shell.mjs
// (redirecciones, sed -i, rm, mv, cp, git checkout/restore…, find -delete,
// xargs, bucles y código en línea): es una ayuda, no una garantía. La garantía
// es la comprobación de resultado del hook Stop (A7).
//
// Node sin dependencias, para Linux y Windows. Si algo falla por dentro
// (también si shell.mjs falta o no carga), bloquea igualmente; settings.json
// añade onFailure: "block" para los fallos de arranque y de tiempo.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const TESTS_DIR = 'server/src/tests';
const PERMISSION_FILE = '.claude/permiso-tests.txt';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'Monitor']);

const WRITES_OPERANDS = new Set([
  'rm', 'unlink', 'shred', 'srm', 'rmdir', 'truncate', 'touch',
  'remove-item', 'ri', 'del', 'erase', 'rd', 'clear-content', 'clc',
  'set-content', 'sc', 'add-content', 'ac', 'out-file', 'new-item', 'ni',
]);
const MOVES = new Set(['mv', 'move', 'move-item', 'mi', 'rename-item', 'ren', 'rni', 'rename']);
const COPIES = new Set(['cp', 'copy', 'copy-item', 'cpi', 'install', 'rsync', 'ln']);
const GIT_WRITES = new Set([
  'checkout', 'restore', 'rm', 'mv', 'reset', 'stash', 'clean', 'switch', 'apply', 'am',
  'merge', 'pull', 'rebase', 'cherry-pick', 'revert', 'read-tree', 'checkout-index', 'update-index',
]);
const FIX_FLAGS = new Set(['--write', '--fix', '--in-place']);
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
const EMERGENCY = 'Avisa al desarrollador: la desactivación de emergencia es suya (/hooks o .claude/settings.json).';

// Funciones de shell.mjs; se cargan al final, con import() dinámico.
let toSlash, toKey, stripTrailing, absolute, relInside, isDirectory, chain, globToRegExp;
let expand, withVariableValues, resolveWord, operands, programName, stripPrefixes;
let inlineCode, codePathCandidates, xargsCommand, parseFind, findSelects, walkCommand;
let POSIX_SHELLS, OTHER_SHELLS, INLINE_FLAGS;

let projectRoot = '';
const violations = [];
const trackedCache = new Map();
const permittedCache = new Map();

// ---------- Tests protegidos ----------

const covers = (dirKey, fileKey) => dirKey === '' || fileKey === dirKey || fileKey.startsWith(`${dirKey}/`);

function couldCoverTests(relKey) {
  const t = toKey(TESTS_DIR);
  return covers(relKey, t) || relKey.startsWith(`${t}/`);
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

function protectedByGlob(absPattern) {
  const literal = absPattern.slice(0, absPattern.search(/[*?[]/));
  const baseDir = stripTrailing(literal.slice(0, literal.lastIndexOf('/') + 1)) || '/';
  const re = globToRegExp(absPattern);
  return protectedUnder(baseDir).filter((f) => chain(f.abs, baseDir).some((p) => re.test(p)));
}

function checkPath(word, ctx, how) {
  for (const { abs, glob } of resolveWord(word, ctx)) {
    for (const f of glob ? protectedByGlob(abs) : protectedUnder(abs)) violations.push({ ...f, how });
  }
}

// ---------- Reglas de los comandos ----------

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

const rules = {
  redirect(r, ctx) {
    if (WRITE_REDIRECTS.has(r.op)) checkPath(r.target, ctx, `redirección ${r.op}`);
  },
  invocation(prog, args, ctx, info) {
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
      checkXargs(args, ctx, info);
      return;
    }
    if (INLINE_FLAGS.has(prog)) {
      for (const code of inlineCode(prog, args, info.seg)) scanCode(code, ctx, prog);
      return;
    }
    const fix = args.find((a) => FIX_FLAGS.has(a.split('=')[0]));
    if (fix) for (const a of operands(args)) checkPath(a, ctx, `${prog} ${fix}`);
  },
};

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
  const find = parseFind(args);
  if (!find.deletes && !find.execs.some(([p, a]) => isWriteInvocation(p, a))) return;
  for (const start of find.starts) {
    const e = expand(start, ctx.cwd);
    if (e === null) continue;
    const startAbs = absolute(ctx.cwd, e);
    const shownStart = stripTrailing(toSlash(e));
    for (const f of protectedUnder(startAbs)) {
      if (findSelects(find, f.abs, startAbs, shownStart)) violations.push({ ...f, how: 'find' });
    }
  }
}

function checkXargs(args, ctx, info) {
  const inner = xargsCommand(args);
  if (!inner.length) return;
  const prog = programName(inner[0]);
  info.dispatch(prog, inner.slice(1), ctx);
  if (!isWriteInvocation(prog, inner.slice(1))) return;
  // Las rutas llegan por la tubería: se buscan en el resto de la tubería.
  for (const other of info.pipeline ?? []) {
    if (other === info.seg) continue;
    for (const w of stripPrefixes(other.words).slice(1)) {
      if (!w.startsWith('-')) checkPath(w, ctx, `xargs ${prog}`);
    }
  }
}

function scanCode(code, ctx, prog) {
  const cleaned = code.replace(/\b(?:process|sys)\.std(?:out|err)\.write\b/g, '');
  if (!WRITE_API.test(cleaned)) return;
  for (const candidate of codePathCandidates(cleaned)) checkPath(candidate, ctx, `${prog} (código en línea)`);
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
    walkCommand(command, cwd, rules);
  } else {
    return;
  }
  if (violations.length) report();
}

let shell = null;
try {
  shell = await import('./shell.mjs');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `proteger-tests: no se pudo cargar .claude/hooks/shell.mjs (${message}). Se bloquea por precaución. ${EMERGENCY}\n`,
  );
  process.exitCode = 2;
}

if (shell) {
  ({ toSlash, toKey, stripTrailing, absolute, relInside, isDirectory, chain, globToRegExp } = shell);
  ({ expand, withVariableValues, resolveWord, operands, programName, stripPrefixes } = shell);
  ({ inlineCode, codePathCandidates, xargsCommand, parseFind, findSelects, walkCommand } = shell);
  ({ POSIX_SHELLS, OTHER_SHELLS, INLINE_FLAGS } = shell);
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`proteger-tests: error interno del hook (${message}). Se bloquea por precaución. ${EMERGENCY}\n`);
    process.exitCode = 2;
  }
}
