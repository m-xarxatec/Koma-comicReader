import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';

// Cierre del bloque 6 (/code-review, 18-nov): «Mis ilustraciones» se pinta con el estado del momento. Si el admin
// aprueba una ilustración con la página abierta, sale en el tablero, pero su fila sigue «pendiente»; al retirarla
// desde ahí, el tablero no se recargaba y la ilustración retirada seguía a la vista. Se lee el JS compilado.

const community = readFileSync(path.join(paths.clientDistDir, 'pages', 'community.js'), 'utf8');

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}()`);
  const next = source.slice(start + 1).search(/\n(async )?function /);
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next);
}

test('RN-22: al retirar una ilustración, /comunidad recarga el tablero siempre, no solo si su fila decía «aprobada»', () => {
  const withdraw = functionBody(community, 'withdraw');
  assert.match(withdraw, /await loadMine\(\)/, 'recarga «Mis ilustraciones»');
  assert.match(withdraw, /await loadBoard\(\)/, 'recarga el tablero');
  assert.doesNotMatch(withdraw, /status === 'approved'\)\s*await loadBoard/, 'sin depender del estado pintado, que puede estar desfasado');
});
