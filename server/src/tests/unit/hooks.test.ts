import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { paths } from '../../config/paths.js';

// Plan de limpieza del harness, A6: el hook PreToolUse .claude/hooks/proteger-secretos.mjs, con la misma entrada JSON
// que le da Claude Code. Corre contra una carpeta temporal con secretos falsos (CLAUDE_PROJECT_DIR apunta a ella), así
// que no depende de lo que haya en el ordenador ni en la CI. exit 2 = bloqueado; exit 0 = pasa.
// Casos que deben seguir bloqueando y falsos positivos encontrados el 14-nov: bash no expande comodines entre comillas
// (sed 's/=.*//', grep '.*') y una clase «[…]» con un rango al revés (l-i) no debe romper el hook.

const HOOK = path.join(paths.root, '.claude', 'hooks', 'proteger-secretos.mjs');
let project = '';

before(() => {
  project = mkdtempSync(path.join(tmpdir(), 'koma-hooks-'));
  writeFileSync(path.join(project, '.env'), 'FALSO=1\n');
  writeFileSync(path.join(project, '.env.online'), 'FALSO=1\n');
  mkdirSync(path.join(project, 'docs'));
  writeFileSync(path.join(project, 'docs', 'credenciales.local.md'), 'falso\n');
});

after(() => {
  rmSync(project, { recursive: true, force: true });
});

function run(command: string, tool = 'Bash'): { status: number | null; stderr: string } {
  const input = { session_id: 'test', hook_event_name: 'PreToolUse', cwd: project, tool_name: tool, tool_input: { command } };
  const result = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
  });
  return { status: result.status, stderr: result.stderr };
}

function assertBlocks(command: string, tool = 'Bash'): void {
  const { status, stderr } = run(command, tool);
  assert.equal(status, 2, `debería bloquear: ${command}`);
  assert.match(stderr, /proteger-secretos: bloqueado/, `bloqueo por secreto, no por fallo interno: ${command}`);
}

function assertPasses(command: string, tool = 'Bash'): void {
  const { status, stderr } = run(command, tool);
  assert.equal(status, 0, `debería pasar: ${command}\n${stderr}`);
}

test('Seguridad: proteger-secretos bloquea leer un secreto, también con su nombre entre comillas', () => {
  assertBlocks('cat .env');
  assertBlocks("cat '.env'");
  assertBlocks('head docs/credenciales.local.md');
});

test('Seguridad: proteger-secretos bloquea un comodín sin comillas que llega a un secreto', () => {
  assertBlocks('cat .*');
  assertBlocks("cat '.env'*");
  assertBlocks('for f in .*; do cat "$f"; done');
  assertBlocks("for f in '.*'; do cat $f; done");
});

test('Seguridad: proteger-secretos mantiene los comodines que el programa expande por su cuenta', () => {
  assertBlocks("find . -name '.env*' -exec cat {} \\;");
  assertBlocks("zip copia.zip '.env*'");
  assertBlocks("Get-Content '.env*'", 'PowerShell');
});

test('Seguridad: proteger-secretos no expande comodines entre comillas en bash', () => {
  assertPasses("echo a | sed 's/=.*//'");
  assertPasses("echo a | grep '.*'");
  assertPasses('echo a | grep ".*"');
  assertPasses(
    "rg -n \"^[A-Z_]+=\" .env.example | sed 's/=.*//' ; echo ---; cat .env.test | sed 's/=.*/=<…>/'; echo ---; rg -n \"z\\.|optional|default\" server/src/config/env.ts | head -60",
  );
});

test('Seguridad: proteger-secretos no se rompe con una clase de comodín con el rango al revés', () => {
  assertPasses("python3 -c 'print(d[\"disable-model-invocation\"])'");
  assertPasses("echo a | grep '[l-i]'");
  assertPasses('cat [l-i]');
});
