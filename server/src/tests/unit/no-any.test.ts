import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';

// Regla del profesor: ningún `any` de tipo en TypeScript (servidor, cliente y tests), ni directivas que apaguen el
// comprobador de tipos. typescript 7 no expone su analizador a JavaScript, así que el test trae un analizador léxico
// mínimo: separa el código de los comentarios, las cadenas ('…', "…", `…` con sus ${…} anidados) y los regex
// literales, y busca el token `any` solo en el código. Así "anyone", "cualquier" o un `any` dentro de un comentario
// o de un texto no cuentan, y uno dentro de un ${…} de una plantilla sí. Es más estricto que la regla: también
// rechazaría una variable llamada `any`, que no tiene sentido en este proyecto.

interface Scanned {
  code: string; // el archivo con comentarios, cadenas y regex sustituidos por espacios (conserva los saltos de línea)
  comments: { text: string; line: number }[];
}

// Tras estos caracteres o palabras, un `/` empieza un regex literal; tras un identificador, un número, `)` o `]`, divide.
const REGEX_AFTER_CHAR = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);

function scan(source: string): Scanned {
  const out = [...source];
  const comments: Scanned['comments'] = [];
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  const lineAt = (index: number) => source.slice(0, index).split('\n').length;
  // Último carácter o palabra significativos del código ya recorrido (para distinguir regex de división).
  let lastSignificant = '';
  const braces: number[] = []; // profundidad de llaves dentro de cada ${…} abierto de una plantilla
  let i = 0;

  // Recorre el texto de una plantilla desde `start` (justo después de ` o de }) hasta su cierre o un ${.
  const templateBody = (start: number): number => {
    let j = start;
    while (j < source.length) {
      if (source[j] === '\\') j += 2;
      else if (source[j] === '`') {
        blank(start, j + 1);
        return j + 1;
      } else if (source[j] === '$' && source[j + 1] === '{') {
        blank(start, j);
        braces.push(0);
        return j + 2;
      } else j++;
    }
    blank(start, j);
    return j;
  };

  while (i < source.length) {
    const char = source[i]!;
    const next = source[i + 1];
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', i) === -1 ? source.length : source.indexOf('\n', i);
      comments.push({ text: source.slice(i + 2, end), line: lineAt(i) });
      blank(i, end);
      i = end;
    } else if (char === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      const end = close === -1 ? source.length : close + 2;
      comments.push({ text: source.slice(i + 2, close === -1 ? end : close), line: lineAt(i) });
      blank(i, end);
      i = end;
    } else if (char === "'" || char === '"') {
      let j = i + 1;
      while (j < source.length && source[j] !== char && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1;
      blank(i, j + 1);
      i = j + 1;
      lastSignificant = 'x';
    } else if (char === '`') {
      blank(i, i + 1);
      i = templateBody(i + 1);
      lastSignificant = 'x';
    } else if (char === '{' && braces.length > 0) {
      braces[braces.length - 1]!++;
      lastSignificant = char;
      i++;
    } else if (char === '}' && braces.length > 0 && braces[braces.length - 1] === 0) {
      braces.pop(); // fin del ${…}: sigue el texto de la plantilla
      i = templateBody(i + 1);
      lastSignificant = 'x';
    } else if (char === '}' && braces.length > 0) {
      braces[braces.length - 1]!--;
      lastSignificant = char;
      i++;
    } else if (char === '/' && (lastSignificant === '' || REGEX_AFTER_CHAR.has(lastSignificant) || REGEX_AFTER_WORD.has(lastSignificant))) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length && source[j] !== '\n') {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === '/' && !inClass) break;
        if (source[j] === '[') inClass = true;
        else if (source[j] === ']') inClass = false;
        j++;
      }
      j++;
      while (j < source.length && /[a-z]/i.test(source[j]!)) j++; // flags
      blank(i, j);
      i = j;
      lastSignificant = 'x';
    } else if (/[A-Za-z_$]/.test(char)) {
      let j = i;
      while (j < source.length && /[\w$]/.test(source[j]!)) j++;
      lastSignificant = source.slice(i, j);
      i = j;
    } else {
      if (!/\s/.test(char)) lastSignificant = char;
      i++;
    }
  }
  return { code: out.join(''), comments };
}

const ANY_TOKEN = new RegExp('\\b' + 'any' + '\\b', 'g');
// Directiva al principio del comentario (como la interpreta tsc), no una mención dentro de una frase.
const DIRECTIVE = new RegExp('^[\\s*]*@ts-(ignore|expect-error|nocheck)\\b');

function anyTokens(source: string): number[] {
  const { code } = scan(source);
  return [...code.matchAll(ANY_TOKEN)].map((match) => code.slice(0, match.index).split('\n').length);
}

function directives(source: string): number[] {
  return scan(source).comments.filter((comment) => DIRECTIVE.test(comment.text)).map((comment) => comment.line);
}

const sourceFiles = () =>
  ['server/src', 'client/src'].flatMap((dir) =>
    (readdirSync(path.join(paths.root, dir), { recursive: true }) as string[])
      .filter((file) => file.endsWith('.ts'))
      .map((file) => path.join(dir, file)),
  );

test('Seguridad: el analizador encuentra los any de tipo e ignora comentarios, cadenas y regex', () => {
  const found = [
    'const a: ' + 'any = 1;',
    'const b = x as ' + 'any;',
    'const c = <' + 'any>x;',
    'let d: ' + 'any[] = [];',
    'let e: Array<' + 'any> = [];',
    'function f(x: string | ' + 'any) {}',
    'type G = Record<string, ' + 'any>;',
    'const h = `texto ${(x as ' + 'any).y} fin`;',
    'const i = `a ${`b ${x as ' + 'any}`} c`;',
    'const j = { k: (v: unknown) => v as ' + 'any };',
  ];
  for (const sample of found) assert.equal(anyTokens(sample).length, 1, sample);
  const ignored = [
    '// cualquier cosa: ' + 'any',
    '/* ' + 'any */ const a = 1;',
    "const s = '" + "any';",
    'const s = "anyone y ' + 'any";',
    'const t = `sin ' + 'any ${x} tampoco ' + 'any`;',
    'const r = /' + 'any\\/["\']/u;',
    'const s = x.replace(/["\']/g, "") + "' + 'any";',
    'const company = 1; const anyone = 2; const many = 3;',
    'const q = a / b / c; // ' + 'any',
  ];
  for (const sample of ignored) assert.deepEqual(anyTokens(sample), [], sample);
  assert.deepEqual(anyTokens('const a = 1;\nconst b: ' + 'any = 2;'), [2], 'devuelve la línea');
});

test('Seguridad: el analizador reconoce las directivas que apagan el comprobador solo al principio de un comentario', () => {
  const directive = (name: string) => '@ts-' + name;
  for (const sample of [`// ${directive('ignore')}`, `/* ${directive('expect-error')} */`, `// ${directive('nocheck')}`, `/** ${directive('ignore')} */`]) {
    assert.equal(directives(sample).length, 1, sample);
  }
  for (const sample of [`// no se usa ${directive('ignore')}`, `const s = '// ${directive('ignore')}';`]) {
    assert.deepEqual(directives(sample), [], sample);
  }
});

test('Seguridad: el código no usa any', () => {
  const files = sourceFiles();
  assert.ok(files.length > 100, `se recorren server/src y client/src (${files.length} archivos)`);
  const offenders = files.flatMap((file) => anyTokens(readFileSync(path.join(paths.root, file), 'utf8')).map((line) => `${file}:${line}`));
  assert.deepEqual(offenders, [], `any de tipo en:\n${offenders.join('\n')}`);
});

test('Seguridad: el código no apaga el comprobador de tipos con directivas', () => {
  const offenders = sourceFiles().flatMap((file) => directives(readFileSync(path.join(paths.root, file), 'utf8')).map((line) => `${file}:${line}`));
  assert.deepEqual(offenders, [], `directivas en:\n${offenders.join('\n')}`);
});
