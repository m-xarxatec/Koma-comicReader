import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as limits from '../../config/limits.js';
import { paths } from '../../config/paths.js';
import { boardQuery, illustrationBody } from '../../modules/illustrations/illustrations.schema.js';
import { parseTags, tagsProblem } from '../../modules/illustrations/illustrations.rules.js';

// /comunidad (contrato del bloque 6; RN-22): el cliente duplica de forma explícita los límites y las reglas del
// servidor. Se carga el JS compilado (client/dist, lo genera `tsc -b`) y se le pasan los mismos casos.

type Problem = (value: string) => string | null;
interface BoardState {
  tag: string | null;
  page: number;
}
interface ClientIllustrations {
  ILLUSTRATION_TITLE_MAX: number;
  ILLUSTRATION_DESCRIPTION_MAX: number;
  ILLUSTRATION_TAGS_MAX: number;
  ILLUSTRATION_TAG_MIN: number;
  ILLUSTRATION_TAG_MAX: number;
  ILLUSTRATION_PENDING_MAX: number;
  ILLUSTRATIONS_PAGE_SIZE: number;
  parseTags: (text: string) => string[];
  tagsProblem: (tags: readonly string[]) => string | null;
  illustrationTitleProblem: Problem;
  illustrationDescriptionProblem: Problem;
  illustrationTagsProblem: Problem;
  imageProblem: (file: { size: number; type: string } | null) => string | null;
  readBoardState: (search: URLSearchParams) => BoardState;
  boardQueryString: (state: BoardState) => string;
  pageCount: (total: number, pageSize: number) => number;
}

const load = <T>(file: string) => import(pathToFileURL(path.join(paths.clientDistDir, file)).href) as Promise<T>;
const client = await load<ClientIllustrations>('utils/illustrations.js');

// Mensaje del primer problema de un campo en el schema del servidor, o null si es válido.
function serverProblem(input: Record<string, string>, field: string): string | null {
  const result = illustrationBody.safeParse(input);
  if (result.success) return null;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message ?? null;
}

const TAG_TEXTS = [
  '',
  'acuarela',
  'Acuarela, ACUARELA, acuarela ',
  'Ciencia Ficción, fan-art,  ,terror',
  'a, bb',
  `uno, dos, tres, cuatro, cinco, seis`,
  'x'.repeat(31),
  'ñandú, ¡hola!, día_de_lluvia',
  ',,,',
  '日本語',
];

test('RN-22: el cliente repite los límites de las ilustraciones de limits.ts', () => {
  for (const name of [
    'ILLUSTRATION_TITLE_MAX',
    'ILLUSTRATION_DESCRIPTION_MAX',
    'ILLUSTRATION_TAGS_MAX',
    'ILLUSTRATION_TAG_MIN',
    'ILLUSTRATION_TAG_MAX',
    'ILLUSTRATION_PENDING_MAX',
    'ILLUSTRATIONS_PAGE_SIZE',
  ] as const) {
    assert.equal(client[name], limits[name], name);
  }
});

test('RN-22: (D3) el cliente normaliza las etiquetas y las valida como el servidor, con los mismos mensajes', () => {
  for (const text of TAG_TEXTS) {
    assert.deepEqual(client.parseTags(text), parseTags(text), JSON.stringify(text));
    assert.equal(client.tagsProblem(client.parseTags(text)), tagsProblem(parseTags(text)), JSON.stringify(text));
    assert.equal(client.illustrationTagsProblem(text), serverProblem({ title: 'Título', tags: text }, 'tags'), JSON.stringify(text));
  }
  assert.equal(client.illustrationTagsProblem('uno, dos, tres, cuatro, cinco, seis'), 'Puedes poner como mucho 5 etiquetas');
  assert.equal(client.illustrationTagsProblem('a'), 'Cada etiqueta debe tener entre 2 y 30 caracteres');
  assert.equal(client.illustrationTagsProblem('uno, dos, tres, cuatro, cinco'), null);
});

test('RN-22: (D6) título obligatorio de 1 a 100 y descripción opcional de 0 a 500, como el servidor', () => {
  for (const title of ['', '   ', 'a', 'Mi dibujo', 'x'.repeat(100), 'x'.repeat(101), 'con\u0007control', 'dos\nlíneas', '  con espacios  ']) {
    assert.equal(client.illustrationTitleProblem(title), serverProblem({ title }, 'title'), JSON.stringify(title));
  }
  for (const description of ['', '   ', 'Una línea', 'dos\nlíneas', 'con\r\nretorno', 'x'.repeat(500), 'x'.repeat(501), 'con\u0000nulo']) {
    assert.equal(
      client.illustrationDescriptionProblem(description),
      serverProblem({ title: 'Título', description }, 'description'),
      JSON.stringify(description),
    );
  }
  assert.equal(client.illustrationTitleProblem(''), 'Este campo es obligatorio');
  assert.equal(client.illustrationDescriptionProblem(''), null);
});

test('RN-10: la imagen de una ilustración es obligatoria, JPEG, PNG o WebP y de 5 MB como mucho', () => {
  assert.equal(client.imageProblem(null), 'Elige una imagen');
  assert.equal(client.imageProblem({ size: 1024, type: 'image/png' }), null);
  assert.equal(client.imageProblem({ size: 1024, type: 'image/jpeg' }), null);
  assert.equal(client.imageProblem({ size: limits.MAX_IMAGE_BYTES, type: 'image/webp' }), null);
  assert.equal(client.imageProblem({ size: limits.MAX_IMAGE_BYTES + 1, type: 'image/webp' }), 'La imagen no puede pasar de 5 MB');
  assert.equal(client.imageProblem({ size: 1024, type: 'image/gif' }), 'La imagen debe ser JPEG, PNG o WebP');
  assert.equal(client.imageProblem({ size: 1024, type: 'image/svg+xml' }), 'La imagen debe ser JPEG, PNG o WebP');
  assert.equal(client.imageProblem({ size: 0, type: 'image/png' }), 'Elige una imagen');
});

test('RN-22: el estado del tablero sale de la URL: una etiqueta o una página que el servidor rechazaría se descartan', () => {
  const read = (query: string) => client.readBoardState(new URLSearchParams(query));
  assert.deepEqual(read(''), { tag: null, page: 1 });
  assert.deepEqual(read('tag=fan-art&page=3'), { tag: 'fan-art', page: 3 });
  for (const tag of ['Fan Art', 'a', 'x'.repeat(31), '-acuarela', 'a--b', '<script>', '']) {
    assert.deepEqual(read(`tag=${encodeURIComponent(tag)}`), { tag: null, page: 1 }, JSON.stringify(tag));
    assert.equal(boardQuery.safeParse({ tag }).success, false, `el servidor también rechaza ${JSON.stringify(tag)}`);
  }
  for (const page of ['0', '-1', '1.5', 'abc', '', '1e3', '99999999999999999999']) {
    assert.deepEqual(read(`page=${page}`), { tag: null, page: 1 }, JSON.stringify(page));
  }
  assert.equal(boardQuery.safeParse({ tag: 'fan-art', page: '3' }).success, true);
});

test('RN-22: boardQueryString monta la consulta del tablero sin valores por defecto y escapada', () => {
  assert.equal(client.boardQueryString({ tag: null, page: 1 }), '');
  assert.equal(client.boardQueryString({ tag: 'fan-art', page: 1 }), '?tag=fan-art');
  assert.equal(client.boardQueryString({ tag: null, page: 2 }), '?page=2');
  assert.equal(client.boardQueryString({ tag: 'fan-art', page: 2 }), '?tag=fan-art&page=2');
  assert.equal(client.boardQueryString({ tag: 'a&b=c', page: 1 }), '?tag=a%26b%3Dc');
});

test('RN-22: pageCount da las páginas de una lista (24 por página en el tablero)', () => {
  assert.equal(client.pageCount(0, 24), 0);
  assert.equal(client.pageCount(1, 24), 1);
  assert.equal(client.pageCount(24, 24), 1);
  assert.equal(client.pageCount(25, 24), 2);
});
