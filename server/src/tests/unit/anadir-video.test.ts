import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';

// Script de la skill /anadir-video (CU-42; cierre del bloque 6, /code-review, 18-nov). Se importa sin ejecutarlo:
// su main() solo corre con import.meta.main. No usa la red: solo sus funciones puras.

interface AddVideo {
  insertEntries: (source: string, videos: { id: string; title: string; description: string }[]) => string;
  decodeEntities: (text: string) => string;
}
const load = () =>
  import(pathToFileURL(path.join(paths.root, '.claude', 'skills', 'anadir-video', 'anadir-video.mjs')).href) as Promise<AddVideo>;

const LIST_START = 'export const TUTORIALS: readonly Tutorial[] = [';
const source = [
  '// cabecera',
  LIST_START,
  '  {',
  "    id: 'AAAAAAAAAAA',",
  "    title: 'Arrays en JS: let lista = [];',",
  "    description: 'Cierra con ]; y sigue.',",
  '  },',
  '];',
  '',
  '// después de la lista',
  '',
].join('\n');

test('Seguridad: (CU-42) /anadir-video añade al final de TUTORIALS aunque un título o una descripción ya guardados contengan «];»', async () => {
  const { insertEntries } = await load();
  const result = insertEntries(source, [{ id: 'BBBBBBBBBBB', title: 'Nuevo', description: 'Otro vídeo.' }]);
  assert.ok(result.includes("    title: 'Arrays en JS: let lista = [];',\n    description: 'Cierra con ]; y sigue.',\n  },\n"), 'la entrada anterior, entera');
  assert.ok(result.indexOf("id: 'AAAAAAAAAAA'") < result.indexOf("id: 'BBBBBBBBBBB'"), 'la nueva, después');
  assert.ok(result.endsWith("    description: 'Otro vídeo.',\n  },\n];\n\n// después de la lista\n"), 'la lista se cierra tras la nueva y lo de después sigue igual');
  const empty = insertEntries(`${LIST_START}];\n`, [{ id: 'CCCCCCCCCCC', title: 'Primero', description: 'Uno.' }]);
  assert.equal(empty, `${LIST_START}\n  {\n    id: 'CCCCCCCCCCC',\n    title: 'Primero',\n    description: 'Uno.',\n  },\n];\n`, 'también con la lista vacía en una línea');
  assert.throws(() => insertEntries('// sin lista\n', []), /No encuentro la lista TUTORIALS/);
});

test('Seguridad: (CU-42) /anadir-video traduce las entidades de la descripción de respaldo: decimales, hexadecimales y con nombre, una sola vez', async () => {
  const { decodeEntities } = await load();
  assert.equal(decodeEntities('I&#x27;m &#39;yo&#39; &amp; tú: &quot;dibuja&quot; &lt;3 &#X41;&apos;'), 'I\'m \'yo\' & tú: "dibuja" <3 A\'');
  assert.equal(decodeEntities('&amp;#39; &amp;quot;'), '&#39; &quot;', '&amp; se traduce el último: no se decodifica dos veces');
});
