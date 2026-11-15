#!/usr/bin/env node
// Hook PreToolUse «proteger-secretos» (plan_limpieza.md, A6 y sección 11).
//
// Bloquea (exit 2) leer, copiar, mostrar o editar los archivos con secretos
// (.env, .env.online y credenciales.local.md con ese nombre en cualquier
// carpeta, y /proc/*/environ) e imprimir variables de entorno con secretos:
// - Read, Edit, Write, MultiEdit y NotebookEdit: por ruta.
// - Grep: si apunta a un secreto o su glob lo incluye (el glob se salta .gitignore).
// - Bash, PowerShell y Monitor, con el análisis aproximado de shell.mjs:
//   cualquier mención de un secreto, salvo en órdenes que solo miran nombres
//   (ls, stat, test, echo…); grep -r, rg -u, diff -r, git grep --no-index y
//   find -exec o | xargs sobre carpetas que los contienen; printenv, env,
//   export -p, set, gci env:, docker compose config, docker inspect…; y
//   $VARIABLE con nombre de secreto.
// node puede cargar .env o .env.online con --env-file solo para ejecutar
// scripts de server/dist/ (los de npm), sin código en línea ni entrada
// estándar. Con .env.online, además, pregunta (permissionDecision "ask"),
// igual que A4 con npm run …:online. .env.test no es secreto.
//
// Es una ayuda, no una garantía: un script guardado en un archivo puede leer
// lo que quiera. Node sin dependencias, para Linux y Windows. Si algo falla por
// dentro (también si shell.mjs falta o no carga), bloquea; settings.json añade
// onFailure: "block" para los fallos de arranque y de tiempo.

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SECRET_NAMES = ['.env', '.env.online', 'credenciales.local.md'];
const ONLINE_ENV = '.env.online';
const PROJECT_SECRETS = ['.env', '.env.online', 'docs/credenciales.local.md'];

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'Monitor']);

// Órdenes que solo miran nombres o metadatos: pueden nombrar un secreto.
const METADATA = new Set([
  'ls', 'dir', 'stat', 'test', '[', '[[', 'file', 'du',
  'get-childitem', 'gci', 'get-item', 'gi', 'test-path',
  'echo', 'printf', 'write-host', 'write-output',
]);
const METADATA_GIT = new Set(['check-ignore', 'status', 'ls-files']);
const LEADING = new Set([
  'sudo', 'doas', 'nohup', 'time', 'command', 'builtin', 'exec', 'stdbuf',
  'then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}',
]);
const LEADING_WITH_FLAGS = new Set(['sudo', 'doas', 'stdbuf', 'command', 'exec']);
const SECRET_VAR = /SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE|ACCESS_KEY|API_KEY|DATABASE_URL/i;
const GREPS = new Set(['grep', 'egrep', 'fgrep', 'ugrep', 'zgrep']);
const GREP_VALUE_OPTS = new Set([
  '-A', '-B', '-C', '-m', '-d', '-D', '--max-count', '--label', '--context',
  '--after-context', '--before-context', '--include', '--exclude', '--exclude-dir', '--exclude-from',
]);
const FILTER_OPTS = new Set(['--include', '--exclude', '--exclude-dir', '--glob', '--iglob', '-g']);
const NODE_VALUE_FLAGS = new Set([
  '--test-name-pattern', '--test-skip-pattern', '--test-reporter', '--test-reporter-destination',
  '--test-concurrency', '--test-timeout', '--test-shard', '--test-coverage-include', '--test-coverage-exclude',
  '--watch-path', '--input-type', '--title', '--inspect-port', '--conditions', '-C', '--disable-warning',
]);
const DOCKERS = new Set(['docker', 'docker-compose', 'podman']);
// Expanden comodines por su cuenta, aunque lleguen entre comillas (find va aparte, con -name y -path).
const OWN_GLOBS = new Set(['git', 'zip', '7z', '7za', '7zr', 'rsync', 'tar', 'scp']);
const GLOB_LIMIT = 10000;

const RULE =
  'Regla (plan_limpieza.md, sección 11, y A6): .env, .env.online y docs/credenciales.local.md no se leen, no se copian, no se muestran ni se editan, y no se imprimen variables de entorno con secretos. Los scripts de npm ya los cargan con --env-file. Si hace falta un dato, pídeselo al desarrollador. No intentes rodear este candado: si te para, detente y avisa.';
const SEARCH_HINT =
  'Para buscar sin tocarlos, excluye esos archivos (--exclude=.env --exclude=.env.online --exclude=credenciales.local.md) o busca en carpetas o archivos concretos.';
const EMERGENCY = 'Avisa al desarrollador: la desactivación de emergencia es suya (/hooks o .claude/settings.json).';

// Funciones de shell.mjs; se cargan al final, con import() dinámico.
let toSlash, toKey, stripTrailing, absolute, relInside, isDirectory, globToRegExp;
let expand, resolveWord, operands, programName, stripPrefixes;
let inlineCode, codePathCandidates, xargsCommand, parseFind, findSelects, walkCommand;

let projectRoot = '';
let dotglob = false; // PowerShell: * también encaja con los archivos que empiezan por punto
let posixQuotes = false; // bash (y Monitor): los comodines entre comillas no se expanden; en PowerShell, sí
let askOnline = false;
const violations = [];

// ---------- Secretos ----------

const basename = (p) => p.slice(p.lastIndexOf('/') + 1);
const join = (dir, name) => (dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`);

function isSecret(abs) {
  const name = toKey(basename(abs));
  return SECRET_NAMES.some((n) => toKey(n) === name) || /^\/proc\/[^/]+\/environ$/.test(abs);
}

function label(abs) {
  const rel = relInside(projectRoot, abs);
  return rel === null ? abs : rel || '.';
}

// Secretos que existen dentro de una carpeta: los del proyecto y los de los nombres conocidos.
function secretsUnder(dir) {
  const found = new Map();
  const add = (p) => {
    if (existsSync(p)) found.set(toKey(p), p);
  };
  for (const name of [...SECRET_NAMES, 'docs/credenciales.local.md']) add(join(dir, name));
  for (const rel of PROJECT_SECRETS) {
    const p = `${projectRoot}/${rel}`;
    if (relInside(dir, p) !== null) add(p);
  }
  return [...found.values()];
}

// Expande un glob con el disco (** cuenta como *). complete=false si es demasiado amplio.
function expandGlob(absPattern) {
  const parts = absPattern.split('/');
  const first = parts.findIndex((s) => /[*?[]/.test(s));
  let start = parts.slice(0, first).join('/') || '/';
  if (/^[A-Za-z]:$/.test(start)) start += '/';
  let current = [start];
  let seen = 0;
  for (let i = first; i < parts.length; i++) {
    const part = parts[i] === '**' ? '*' : parts[i];
    if (part === '') continue;
    if (!/[*?[]/.test(part)) {
      current = current.map((dir) => join(dir, part));
      continue;
    }
    const re = globToRegExp(part);
    const dotOk = dotglob || part.startsWith('.');
    const next = [];
    for (const dir of current) {
      let entries = [];
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }
      seen += entries.length;
      if (seen > GLOB_LIMIT) return { paths: [], complete: false };
      for (const e of entries) if ((dotOk || !e.startsWith('.')) && re.test(e)) next.push(join(dir, e));
    }
    current = next;
  }
  return { paths: current.filter((p) => existsSync(p)), complete: true };
}

// Secretos a los que llega una palabra: el archivo, un glob y, si recursive, una carpeta.
// literal: sus comodines no se expanden (iban entre comillas en bash).
function secretTargets(word, ctx, recursive = false, selects = () => true, literal = false) {
  const found = [];
  for (const { abs, glob } of resolveWord(word, ctx)) {
    let paths = [abs];
    if (glob && !literal) {
      const { paths: matched, complete } = expandGlob(abs);
      paths = matched;
      if (!complete && SECRET_NAMES.some((n) => globToRegExp(basename(abs)).test(n))) found.push(abs);
    }
    for (const p of paths) {
      if (isSecret(p)) found.push(p);
      else if (recursive && isDirectory(p)) found.push(...secretsUnder(p).filter((s) => selects(s, p)));
    }
  }
  return found;
}

function addFiles(paths, how) {
  for (const p of paths) violations.push({ kind: 'file', label: label(p), how });
}

// Cualquier palabra que nombre un secreto (también --opcion=ruta y @ruta). literal[k]: la palabra k solo tiene
// comodines entre comillas (lex); si además lleva $, se expande igual, porque el valor de una variable sí se expande.
function mentions(words, ctx, how, isNode, literal = []) {
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (isNode && /^--env-file(-if-exists)?=/.test(w)) continue;
    if (isNode && /^--env-file(-if-exists)?$/.test(w)) {
      k++;
      continue;
    }
    if (/^--(include|exclude|exclude-dir|glob|iglob)=/.test(w)) continue; // filtros, no lecturas
    if (FILTER_OPTS.has(w)) {
      k++;
      continue;
    }
    const candidates = [w];
    const eq = w.lastIndexOf('=');
    if (eq > 0) candidates.push(w.slice(eq + 1));
    if (w.startsWith('@')) candidates.push(w.slice(1));
    const asText = literal[k] === true && !w.includes('$');
    for (const c of candidates) addFiles(secretTargets(c, ctx, false, undefined, asText), how);
  }
}

// ---------- Variables de entorno ----------

function leading(words) {
  let k = 0;
  while (k < words.length) {
    const w = words[k];
    if (/^[A-Za-z_]\w*=/.test(w)) {
      k++;
      continue;
    }
    const p = programName(w);
    if (!LEADING.has(p)) break;
    k++;
    if (LEADING_WITH_FLAGS.has(p)) while (k < words.length && words[k].startsWith('-')) k++;
  }
  return words.slice(k);
}

function dumpsEnvironment(prog, args) {
  if (prog === 'env') {
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (a === '-S' || a === '--split-string') return false;
      if (['-u', '--unset', '-C', '--chdir'].includes(a)) k++;
      else if (!a.startsWith('-') && !/^[A-Za-z_]\w*=/.test(a)) return false; // env … orden
    }
    return true;
  }
  if (prog === 'printenv') {
    const names = operands(args);
    return names.length === 0 || names.some((n) => SECRET_VAR.test(n));
  }
  if (prog === 'export') return operands(args).length === 0;
  if (prog === 'declare' || prog === 'typeset') {
    return operands(args).length === 0 && !args.some((a) => /^-[^-]*[fF]/.test(a));
  }
  if (prog === 'set') return args.length === 0;
  if (['get-childitem', 'gci', 'dir', 'ls', 'get-item', 'gi', 'get-content', 'gc', 'cat', 'type'].includes(prog)) {
    return args.some((a) => /^env:/i.test(a));
  }
  return false;
}

// ---------- Reglas de los comandos ----------

const rules = {
  segment(seg, ctx) {
    const words = leading(seg.words);
    if (!words.length) return;
    const prog = programName(words[0]);
    if (dumpsEnvironment(prog, words.slice(1)) || seg.words.some((w) => /GetEnvironmentVariables/i.test(w))) {
      violations.push({ kind: 'dump', how: words.join(' ').slice(0, 60) });
    }
    const rest = stripPrefixes(seg.words);
    if (!rest.length) return;
    const p = programName(rest[0]);
    if (METADATA.has(p)) return;
    if (p === 'git' && METADATA_GIT.has(rest.slice(1).find((a) => !a.startsWith('-')) ?? '')) return;
    if (p === 'find') {
      // -name y -path llevan patrones, no rutas: se miran solo las órdenes de -exec.
      for (const [execProg, execArgs] of parseFind(rest.slice(1)).execs) {
        if (!METADATA.has(execProg)) mentions(execArgs, ctx, `find -exec ${execProg}`, false);
      }
      return;
    }
    const literal = posixQuotes && !OWN_GLOBS.has(p) ? seg.literal.slice(seg.words.length - rest.length + 1) : [];
    mentions(rest.slice(1), ctx, p, p === 'node', literal);
  },
  redirect(r, ctx) {
    if (r.op !== '<<<') addFiles(secretTargets(r.target, ctx), `redirección ${r.op}`);
  },
  invocation(prog, args, ctx, info) {
    if (prog === 'node') checkNode(args, ctx);
    for (const code of inlineCode(prog, args, info.seg)) {
      for (const candidate of codePathCandidates(code)) addFiles(secretTargets(candidate, ctx), `${prog} (código en línea)`);
    }
    const fromXargs = info.seg === null; // las rutas llegan por la tubería
    if (GREPS.has(prog) && recursiveGrep(args)) checkGrep(prog, args, ctx, fromXargs);
    if (prog === 'rg') checkRipgrep(args, ctx, fromXargs);
    if (prog === 'diff' && args.some((a) => a === '--recursive' || /^-[A-Za-z]*r[A-Za-z]*$/.test(a))) {
      for (const a of operands(args)) addFiles(secretTargets(a, ctx, true), 'diff -r');
    }
    if (prog === 'git' && args[0] === 'grep' && args.some((a) => a === '--no-index' || a === '--no-exclude-standard')) {
      const paths = grepPaths(args.slice(1));
      for (const a of paths.length || fromXargs ? paths : ['.']) addFiles(secretTargets(a, ctx, true), 'git grep');
    }
    if (prog === 'find') {
      const find = parseFind(args);
      if (find.execs.some(([p]) => !METADATA.has(p))) findCoverage(find, ctx, 'find -exec');
    }
    if (prog === 'xargs') checkXargs(args, ctx, info);
    if (DOCKERS.has(prog)) checkDocker(prog, args);
  },
};

function checkNode(args, ctx) {
  const envFiles = [];
  const runs = [];
  const loaders = [];
  let inline = false;
  const test = args.includes('--test');
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    const env = a.match(/^--env-file(?:-if-exists)?(?:=(.*))?$/);
    if (env) {
      const value = env[1] ?? args[++k];
      if (value !== undefined) envFiles.push(value);
      continue;
    }
    if (['-e', '--eval', '-p', '--print'].includes(a)) {
      inline = true;
      k++;
      continue;
    }
    if (/^--(eval|print)=/.test(a) || a === '-i' || a === '--interactive') {
      inline = true;
      continue;
    }
    const loader = a.match(/^(?:-r|--require|--import|--loader|--experimental-loader)(?:=(.*))?$/);
    if (loader) {
      const value = loader[1] ?? args[++k];
      if (value !== undefined) loaders.push(value);
      continue;
    }
    if (NODE_VALUE_FLAGS.has(a)) {
      k++;
      continue;
    }
    if (a === '--') {
      if (args[k + 1] !== undefined) runs.push(args[k + 1]);
      break;
    }
    if (a.startsWith('-') && a !== '-') continue;
    runs.push(a);
    if (!test) break; // node script.js …: lo demás son argumentos del script
  }
  const secrets = envFiles.flatMap((v) => resolveWord(v, ctx)).map((r) => r.abs).filter(isSecret);
  if (!secrets.length) return;
  const serverDist = `${projectRoot}/server/dist`;
  const insideDist = (word) => {
    const resolved = resolveWord(word, ctx);
    return (
      resolved.length > 0 &&
      resolved.every(({ abs, glob }) => {
        const p = glob ? abs.slice(0, abs.slice(0, abs.search(/[*?[]/)).lastIndexOf('/')) : abs;
        return relInside(serverDist, p) !== null;
      })
    );
  };
  if (inline || !runs.length || runs.includes('-') || ![...runs, ...loaders].every(insideDist)) {
    violations.push({ kind: 'node', label: secrets.map(label).join(', '), how: 'node --env-file' });
    return;
  }
  if (secrets.some((p) => toKey(basename(p)) === toKey(ONLINE_ENV))) askOnline = true;
}

function recursiveGrep(args) {
  return args.some(
    (a, k) =>
      a === '--recursive' ||
      a === '--dereference-recursive' ||
      a === '--directories=recurse' ||
      (a === '-d' && args[k + 1] === 'recurse') ||
      (/^-[A-Za-z]+$/.test(a) && /[rR]/.test(a)),
  );
}

// Rutas de grep: los operandos sin el patrón (salvo que el patrón vaya con -e o -f).
function grepPaths(args) {
  const out = [];
  let patternGiven = false;
  let rest = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (rest) {
      out.push(a);
    } else if (a === '--') {
      rest = true;
    } else if (['-e', '--regexp', '-f', '--file'].includes(a) || /^-[A-Za-z]*[ef]$/.test(a)) {
      patternGiven = true;
      k++;
    } else if (/^--(regexp|file)=/.test(a)) {
      patternGiven = true;
    } else if (GREP_VALUE_OPTS.has(a)) {
      k++;
    } else if (!a.startsWith('-')) {
      out.push(a);
    }
  }
  return patternGiven ? out : out.slice(1);
}

function optionValues(args, names) {
  const out = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    for (const n of names) {
      if (a === n && args[k + 1] !== undefined) out.push(args[k + 1]);
      else if (a.startsWith(`${n}=`)) out.push(a.slice(n.length + 1));
    }
  }
  return out;
}

// ¿Un secreto bajo dir pasa los filtros de inclusión y exclusión?
function filterBy(includes, excludes, excludeDirs) {
  return (secret, dir) => {
    const name = basename(secret);
    if (includes.length && !includes.some((g) => globToRegExp(g).test(name))) return false;
    if (excludes.some((g) => globToRegExp(g).test(name))) return false;
    const between = (relInside(dir, secret) ?? '').split('/').slice(0, -1);
    return !between.some((d) => excludeDirs.some((g) => globToRegExp(g).test(d)));
  };
}

function checkGrep(prog, args, ctx, fromXargs) {
  const selects = filterBy(
    optionValues(args, ['--include']),
    optionValues(args, ['--exclude']),
    optionValues(args, ['--exclude-dir']),
  );
  const paths = grepPaths(args);
  for (const a of paths.length || fromXargs ? paths : ['.']) addFiles(secretTargets(a, ctx, true, selects), `${prog} -r`);
}

function checkRipgrep(args, ctx, fromXargs) {
  const globs = optionValues(args, ['-g', '--glob', '--iglob']);
  const includes = globs.filter((g) => !g.startsWith('!'));
  const excludes = globs.filter((g) => g.startsWith('!')).map((g) => g.slice(1));
  const unrestricted = args.some((a) => /^-u+$/.test(a) || a === '--unrestricted' || /^--no-ignore/.test(a) || a === '--hidden' || a === '-.');
  const globNamesSecret = includes.some((g) => SECRET_NAMES.some((n) => globToRegExp(basename(g)).test(n)));
  if (!unrestricted && !globNamesSecret) return; // rg se salta .gitignore y los ocultos
  const selects = filterBy(includes.map(basename), excludes.map(basename), []);
  const paths = grepPaths(args.filter((a, k) => !['-g', '--glob', '--iglob'].includes(args[k - 1]) && !['-g', '--glob', '--iglob'].includes(a)));
  for (const a of paths.length || fromXargs ? paths : ['.']) addFiles(secretTargets(a, ctx, true, selects), 'rg');
}

function findCoverage(find, ctx, how) {
  for (const start of find.starts) {
    const e = expand(start, ctx.cwd);
    if (e === null) continue;
    const startAbs = absolute(ctx.cwd, e);
    const shownStart = stripTrailing(toSlash(e));
    const candidates = isSecret(startAbs) ? [startAbs] : isDirectory(startAbs) ? secretsUnder(startAbs) : [];
    addFiles(candidates.filter((s) => findSelects(find, s, startAbs, shownStart)), how);
  }
}

function checkXargs(args, ctx, info) {
  const inner = xargsCommand(args);
  if (!inner.length) return;
  const innerProg = programName(inner[0]);
  if (METADATA.has(innerProg)) return;
  info.dispatch(innerProg, inner.slice(1), ctx);
  // Las rutas llegan por la tubería: se buscan en el resto de la tubería.
  for (const other of info.pipeline ?? []) {
    if (other === info.seg) continue;
    const words = stripPrefixes(other.words);
    if (!words.length) continue;
    if (programName(words[0]) === 'find') {
      findCoverage(parseFind(words.slice(1)), ctx, `find | xargs ${innerProg}`);
      continue;
    }
    for (const w of words.slice(1)) if (!w.startsWith('-')) addFiles(secretTargets(w, ctx), `xargs ${innerProg}`);
  }
}

function checkDocker(prog, args) {
  const words = args.map((a) => a.toLowerCase());
  const namesOnly = ['--services', '--volumes', '--images', '--profiles', '--networks', '--hash'];
  const how = `${prog} ${args.join(' ')}`.slice(0, 60);
  if (words.includes('config') && !words.some((w) => namesOnly.includes(w))) violations.push({ kind: 'dump', how });
  else if (words.includes('inspect') && !words.includes('image')) violations.push({ kind: 'dump', how });
  else if (words.includes('exec') || words.includes('run')) {
    const runsShell = words.some((w) => ['env', 'printenv', 'set', 'export'].includes(w) || /\/environ$/.test(w));
    const runsCode = words.some((w, k) => ['-e', '--eval', '-p', '--print', '-c'].includes(w) && k > 0 && /^(node|python3?|sh|bash|ash)$/.test(words[k - 1]));
    if (runsShell || runsCode) violations.push({ kind: 'dump', how });
  }
}

// ---------- Entrada y salida ----------

function report() {
  const lines = [];
  const files = [...new Map(violations.filter((v) => v.kind === 'file').map((v) => [v.label, v])).values()];
  if (files.length) {
    const what = files.length === 1 ? 'un archivo con secretos' : `${files.length} archivos con secretos`;
    lines.push(`proteger-secretos: bloqueado (${files[0].how}). Tocaría ${what}: ${files.map((v) => v.label).join(', ')}.`);
    if (files.some((v) => /grep|rg|find|xargs|diff/.test(v.how))) lines.push(SEARCH_HINT);
  }
  const node = violations.find((v) => v.kind === 'node');
  if (node) {
    lines.push(
      `proteger-secretos: bloqueado (node --env-file con ${node.label}). Con un archivo de secretos, node solo puede ejecutar scripts de server/dist/ (los de npm), sin código en línea (-e, -p, -i) ni entrada estándar: si no, podría mostrar los secretos. Usa los scripts de npm (npm run dev, npm run test:api…).`,
    );
  }
  const dump = violations.find((v) => v.kind === 'dump');
  if (dump) lines.push(`proteger-secretos: bloqueado (${dump.how}). Mostraría variables de entorno con secretos.`);
  const variable = violations.find((v) => v.kind === 'variable');
  if (variable) lines.push(`proteger-secretos: bloqueado. El comando usa ${variable.label} y podría mostrar un secreto.`);
  lines.push(RULE);
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
  dotglob = tool === 'PowerShell';
  posixQuotes = tool !== 'PowerShell';

  if (FILE_TOOLS.has(tool)) {
    const filePath = toolInput.file_path ?? toolInput.notebook_path;
    if (typeof filePath !== 'string' || filePath === '') throw new Error(`${tool} sin file_path`);
    const abs = absolute(cwd, filePath);
    if (isSecret(abs)) addFiles([abs], tool);
  } else if (tool === 'Grep') {
    const target = absolute(cwd, typeof toolInput.path === 'string' && toolInput.path ? toolInput.path : cwd);
    if (isSecret(target)) {
      addFiles([target], 'Grep');
    } else if (typeof toolInput.glob === 'string' && toolInput.glob && isDirectory(target)) {
      const re = globToRegExp(basename(toSlash(toolInput.glob)));
      addFiles(secretsUnder(target).filter((s) => re.test(basename(s))), 'Grep con glob');
    }
  } else if (SHELL_TOOLS.has(tool)) {
    const command = toolInput.command;
    if (typeof command !== 'string') {
      if (tool === 'Monitor') return;
      throw new Error(`${tool} sin command`);
    }
    const names = [...command.matchAll(/\$(?:env:)?\{?([A-Za-z_]\w*)|%([A-Za-z_]\w*)%/gi)]
      .map((m) => m[1] ?? m[2])
      .filter((n) => SECRET_VAR.test(n));
    if (names.length) violations.push({ kind: 'variable', label: [...new Set(names)].map((n) => `$${n}`).join(', ') });
    walkCommand(command, cwd, rules);
  } else {
    return;
  }
  if (violations.length) {
    report();
  } else if (askOnline) {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason:
            'proteger-secretos: node con --env-file=.env.online usa las claves de producción (Neon, R2 y Stripe). Confírmalo tú, como con npm run …:online.',
        },
      })}\n`,
    );
  }
}

let shell = null;
try {
  shell = await import('./shell.mjs');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `proteger-secretos: no se pudo cargar .claude/hooks/shell.mjs (${message}). Se bloquea por precaución. ${EMERGENCY}\n`,
  );
  process.exitCode = 2;
}

if (shell) {
  ({ toSlash, toKey, stripTrailing, absolute, relInside, isDirectory, globToRegExp } = shell);
  ({ expand, resolveWord, operands, programName, stripPrefixes } = shell);
  ({ inlineCode, codePathCandidates, xargsCommand, parseFind, findSelects, walkCommand } = shell);
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`proteger-secretos: error interno del hook (${message}). Se bloquea por precaución. ${EMERGENCY}\n`);
    process.exitCode = 2;
  }
}
