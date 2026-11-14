#!/usr/bin/env node
// Hook Stop «verificar-al-terminar» (plan_limpieza.md, A7; CLAUDE.md, «Tests»).
//
// Al terminar cada respuesta de Claude comprueba el resultado, no los comandos:
// 1. Tests protegidos. Si un test existente de server/src/tests/ (uno que está
//    en HEAD) aparece modificado, borrado o renombrado y no figura en
//    .claude/permiso-tests.txt, no deja cerrar y dice qué archivos son. También
//    salta si el cambio lo hizo el desarrollador a mano: es intencionado. Los
//    tests nuevos (sin commit, aunque ya estén en el índice) no cuentan.
// 2. Si git status muestra cambios en server/ o client/, ejecuta npm test y,
//    con fallos, no deja cerrar y devuelve un resumen. No ejecuta test:api,
//    que necesita Postgres.
//
// Respeta stop_hook_active: si Claude ya sigue trabajando por este hook, no
// vuelve a bloquear (no hay bucle); repite las comprobaciones y, si algo sigue
// mal, se lo avisa al desarrollador con systemMessage.
// npm test tarda alrededor de 1 s (medido el 14-nov), así que no hay caché de huellas.
// En Stop, onFailure no tiene efecto: si el hook falla, Claude termina igual,
// así que los errores se avisan al desarrollador con systemMessage.
// Node sin dependencias, para Linux y Windows.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const TESTS_DIR = 'server/src/tests';
const PERMISSION_FILE = '.claude/permiso-tests.txt';
const IS_WINDOWS = process.platform === 'win32';
const TEST_TIMEOUT_MS = 240_000;
const SUMMARY_MAX_LINES = 40;
const SUMMARY_MAX_CHARS = 3000;
const STATUS_NAMES = { M: 'modificado', D: 'borrado o movido', T: 'cambio de tipo', U: 'sin fusionar' };

const toSlash = (p) => p.replaceAll('\\', '/');
const toKey = (p) => (IS_WINDOWS ? p.toLowerCase() : p);

// ---------- Funciones puras (las prueba el arnés) ----------

// Misma regla que proteger-tests.mjs: una ruta por línea, relativa a la raíz; # comenta.
export function parsePermissionFile(text) {
  const set = new Set();
  for (const line of text.split(/\r?\n/)) {
    const entry = toSlash(line.trim()).replace(/^\.\//, '').replace(/\/+$/, '');
    if (entry && !entry.startsWith('#')) set.add(toKey(entry));
  }
  return set;
}

// Salida de `git diff --name-status -z --no-renames HEAD -- server/src/tests`:
// tests de HEAD cambiados que no tienen permiso. «A» (nuevo en el índice) no cuenta.
export function protectedChanges(nameStatusZ, permitted) {
  const parts = nameStatusZ.split('\0').filter(Boolean);
  const changed = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const status = parts[i];
    const file = toSlash(parts[i + 1]);
    if (status.startsWith('A') || permitted.has(toKey(file))) continue;
    changed.push({ file, status: STATUS_NAMES[status[0]] ?? status });
  }
  return changed;
}

// Salida de `git status --porcelain=v1 -z`: ¿hay cambios en server/ o client/?
export function touchesApp(porcelainZ) {
  const entries = porcelainZ.split('\0');
  const isApp = (file) => /^(server|client)\//.test(toSlash(file));
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    if (isApp(entry.slice(3))) return true;
    if (/^[RC]/.test(entry)) {
      i++; // en renombrados y copias, la ruta original va en la entrada siguiente
      if (isApp(entries[i] ?? '')) return true;
    }
  }
  return false;
}

// Resumen de la salida de npm test: errores de tsc o la lista de tests que fallan.
export function summarize(output) {
  const lines = output.split(/\r?\n/).filter((l) => !/^\s+at .*\(node:/.test(l)); // sin marcos internos de Node
  let picked = lines.filter((l) => /error TS\d+/.test(l));
  if (!picked.length) {
    const start = lines.findIndex((l) => /✖ failing tests:/.test(l));
    if (start !== -1) {
      picked = lines.slice(start);
    } else {
      picked = lines.filter((l) => /^\s*(✖|not ok)|^ℹ (tests|pass|fail|cancelled)/.test(l));
    }
  }
  if (!picked.length) picked = lines.filter((l) => l.trim()).slice(-20);
  const counts = lines.filter((l) => /^ℹ (tests|pass|fail) /.test(l));
  const text = [...picked.slice(0, SUMMARY_MAX_LINES), ...counts.filter((l) => !picked.includes(l))].join('\n').trim();
  return text.length > SUMMARY_MAX_CHARS ? `${text.slice(0, SUMMARY_MAX_CHARS)}\n…` : text;
}

// Qué responder a Claude Code. again = stop_hook_active.
export function decide({ again, changes, tests }) {
  const warnings = [];
  if (changes.length) {
    const list = changes.map((c) => `${c.file} (${c.status})`);
    if (!again) {
      return {
        decision: 'block',
        reason: [
          'verificar-al-terminar: hay tests existentes de server/src/tests/ cambiados sin permiso:',
          ...list.map((l) => `- ${l}`),
          'Regla (CLAUDE.md, «Tests»): los tests existentes no se modifican, no se mueven ni se borran. No intentes deshacerlo ni rodear el candado: di al desarrollador qué archivos son y qué ha cambiado, y para. Si el cambio está aprobado, él lista cada archivo en .claude/permiso-tests.txt y tú lo anotas en docs/bitacora.md; si no, él lo restaura.',
        ].join('\n'),
        systemMessage: `verificar-al-terminar: tests existentes cambiados sin permiso: ${list.join(', ')}. Si el cambio está aprobado, lístalos en .claude/permiso-tests.txt; si no, restáuralos.`,
      };
    }
    warnings.push(`verificar-al-terminar: siguen cambiados sin permiso: ${list.join(', ')}.`);
  }
  if (tests && !tests.ok) {
    if (!again) {
      return {
        decision: 'block',
        reason: `verificar-al-terminar: npm test falla (hay cambios en server/ o client/; ${tests.seconds} s). La tarea no está terminada: arregla el código o el test nuevo que has escrito, nunca un test existente. Resumen:\n${tests.summary}`,
        systemMessage: 'verificar-al-terminar: npm test en rojo; Claude sigue trabajando para arreglarlo.',
      };
    }
    warnings.push(`verificar-al-terminar: npm test sigue en rojo al terminar. No des la tarea por buena.\n${tests.summary.split('\n').slice(0, 15).join('\n')}`);
  }
  return warnings.length ? { systemMessage: warnings.join('\n') } : null;
}

// ---------- Git y npm ----------

function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
  if (r.status !== 0) {
    const why = (r.stderr || r.error?.message || `código ${r.status}`).trim().split('\n')[0];
    throw new Error(`git ${args[0]} falló: ${why}`);
  }
  return r.stdout;
}

function permittedTests(root) {
  try {
    return parsePermissionFile(readFileSync(path.join(root, PERMISSION_FILE), 'utf8'));
  } catch {
    return new Set();
  }
}

function runUnitTests(root) {
  const started = Date.now();
  const r = spawnSync('npm test', {
    cwd: root,
    shell: true, // npm es npm.cmd en Windows
    encoding: 'utf8',
    timeout: TEST_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (r.error) return { ok: false, seconds, summary: `npm test no se pudo ejecutar: ${r.error.message}` };
  return { ok: r.status === 0, seconds, summary: summarize(`${r.stdout}\n${r.stderr}`) };
}

async function run() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = raw.trim() ? JSON.parse(raw) : {};
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || path.resolve(import.meta.dirname, '..', '..'));
  const again = input.stop_hook_active === true;

  const nameStatus = git(root, ['diff', '--name-status', '-z', '--no-renames', '--no-ext-diff', 'HEAD', '--', TESTS_DIR]);
  const changes = protectedChanges(nameStatus, permittedTests(root));
  // Con tests protegidos cambiados se bloquea ya: npm test no cambia esa respuesta.
  const tests = changes.length && !again ? null : touchesApp(git(root, ['status', '--porcelain=v1', '-z'])) ? runUnitTests(root) : null;
  const answer = decide({ again, changes, tests });
  if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
}

if (import.meta.main) {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      `${JSON.stringify({ systemMessage: `verificar-al-terminar: no se pudo comprobar (${message}). Revisa a mano git status y npm test.` })}\n`,
    );
  }
}
