#!/usr/bin/env node
// Hook SessionStart «inicio-sesion» (plan_limpieza.md, A8).
//
// Al empezar, reanudar, limpiar (/clear) o compactar la sesión, se lo muestra al
// desarrollador (systemMessage) y lo añade al contexto de Claude
// (additionalContext): la línea «Bloque actual» de CLAUDE.md, git status
// --short (con la rama) y la regla de los tests. Si .claude/permiso-tests.txt
// tiene entradas, avisa de que hay una excepción abierta: solo lo lee, nunca lo toca.
//
// SessionStart no puede bloquear: si algo falla, lo dice en el propio mensaje.
// Node sin dependencias, para Linux y Windows.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PERMISSION_FILE = '.claude/permiso-tests.txt';
const MAX_STATUS_LINES = 25;
const TESTS_RULE =
  'Regla de los tests (CLAUDE.md, «Tests»): los tests existentes de server/src/tests/ no se modifican ni se borran (tampoco helpers.ts ni reading-fixtures.ts); cada funcionalidad o corrección trae su test nuevo, escrito y visto fallar antes de programar.';

// ---------- Funciones puras (las prueba el arnés) ----------

export function currentBlock(claudeMd) {
  const line = claudeMd.split(/\r?\n/).find((l) => /^-\s*Bloque actual:/.test(l));
  if (!line) return null;
  return line
    .replace(/^-\s*/, '')
    .replaceAll('**', '')
    .replace(/\s*Actualizar esta línea.*$/, '')
    .trim();
}

// Misma regla que proteger-tests.mjs: una ruta por línea, relativa a la raíz; # comenta.
export function permissionEntries(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, ''))
    .filter((entry) => entry && !entry.startsWith('#'));
}

export function buildMessage({ block, status, statusError, permitted }) {
  const lines = ['inicio-sesion · Koma'];
  lines.push(block ? block : 'Bloque actual: no encuentro la línea «Bloque actual» en CLAUDE.md.');
  if (statusError) {
    lines.push(`git status: no disponible (${statusError}).`);
  } else {
    const all = status.split(/\r?\n/).filter(Boolean);
    const branch = all[0]?.startsWith('## ') ? all.shift().slice(3) : null;
    if (branch) lines.push(`Rama: ${branch}`);
    if (!all.length) {
      lines.push('git status --short: sin cambios.');
    } else {
      lines.push(`git status --short (${all.length}):`);
      lines.push(...all.slice(0, MAX_STATUS_LINES).map((l) => `  ${l}`));
      if (all.length > MAX_STATUS_LINES) lines.push(`  … y ${all.length - MAX_STATUS_LINES} más`);
    }
  }
  lines.push(TESTS_RULE);
  if (permitted.length) {
    lines.push(
      `Atención: hay una excepción abierta en ${PERMISSION_FILE} (${permitted.join(', ')}). Esos tests se pueden cambiar hasta que el desarrollador vacíe el archivo; la IA no lo toca.`,
    );
  }
  return lines.join('\n');
}

// ---------- Entrada y salida ----------

function readOrNull(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

async function run() {
  for await (const _chunk of process.stdin); // la entrada no hace falta, pero se consume
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || path.resolve(import.meta.dirname, '..', '..'));
  const claudeMd = readOrNull(path.join(root, 'CLAUDE.md'));
  const git = spawnSync('git', ['-C', root, 'status', '--short', '--branch'], {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  });
  const statusError =
    git.status === 0 ? null : (git.stderr || git.error?.message || `código ${git.status}`).trim().split('\n')[0];
  const message = buildMessage({
    block: claudeMd === null ? null : currentBlock(claudeMd),
    status: git.stdout ?? '',
    statusError,
    permitted: permissionEntries(readOrNull(path.join(root, PERMISSION_FILE)) ?? ''),
  });
  process.stdout.write(
    `${JSON.stringify({ systemMessage: message, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: message } })}\n`,
  );
}

if (import.meta.main) {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ systemMessage: `inicio-sesion: no se pudo preparar el resumen (${message}).` })}\n`);
  }
}
