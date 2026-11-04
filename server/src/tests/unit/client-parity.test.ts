import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';
import { CATALOG_MAX_TAGS, CATALOG_PAGE_SIZE, CATALOG_QUERY_MAX_LENGTH, COMMENT_BODY_MAX } from '../../config/limits.js';
import { EMAIL_MAX_CHARS, registerBody } from '../../modules/auth/auth.schema.js';
import { catalogQuery } from '../../modules/comics/comics.schema.js';
import { commentBody } from '../../modules/comments/comments.schema.js';
import { passwordProblem } from '../../utils/password.js';
import { safeNext } from '../../utils/redirect.js';
import { normalizeText, textProblem } from '../../utils/text.js';

// El cliente duplica de forma explícita las reglas del servidor (no hay bundler: zod no llega al navegador).
// Este test carga el JS compilado del cliente (client/dist, lo genera `tsc -b`) y le pasa los mismos casos.

type Problem = (value: string) => string | null;
interface ClientValidate {
  emailProblem: Problem;
  displayNameProblem: Problem;
  passwordProblem: Problem;
  passwordConfirmProblem: (value: string, values: Readonly<Record<string, string>>) => string | null;
}
interface ClientRedirect {
  safeNext: (value: unknown) => string;
}

const load = <T>(file: string) => import(pathToFileURL(path.join(paths.clientDistDir, file)).href) as Promise<T>;
const client = await load<ClientValidate>('utils/validate.js');
const clientRedirect = await load<ClientRedirect>('utils/redirect.js');

interface ClientCatalog {
  CATALOG_QUERY_MAX_LENGTH: number;
  CATALOG_MAX_TAGS: number;
  CATALOG_PAGE_SIZE: number;
  queryProblem: (q: string) => string | null;
  tagsProblem: (tags: string) => string | null;
  readCatalogState: (search: URLSearchParams) => { q: string; tags: string[]; page: number };
  catalogQueryString: (state: { q: string; tags: readonly string[]; page: number }) => string;
}
const clientCatalog = await load<ClientCatalog>('utils/catalog.js');

test('RN-12: el cliente valida la contraseña igual que el servidor, con los mismos mensajes', () => {
  const cases = ['', '123456789', '1234567890', 'a'.repeat(72), 'a'.repeat(73), 'ñ'.repeat(36), 'ñ'.repeat(37), '🙂'.repeat(9), '🙂'.repeat(10), '🙂'.repeat(19)];
  for (const value of cases) assert.equal(client.passwordProblem(value), passwordProblem(value), JSON.stringify(value));
});

test('RN-12: el cliente acepta y rechaza los mismos correos que zod en el servidor', () => {
  // Frontera de EMAIL_MAX_CHARS: 254 caracteres es válido; 255, no.
  const longest = `${'x'.repeat(EMAIL_MAX_CHARS - 5)}@d.es`;
  const tooLong = `x${longest}`;
  assert.equal(longest.length, EMAIL_MAX_CHARS);
  assert.ok(registerBody.shape.email.safeParse(longest).success, 'el servidor acepta 254 caracteres');
  const cases = ['ana@demo.test', '  Ana@Demo.TEST ', 'a@b', 'a b@c.de', 'ñ@demo.test', 'a..b@c.de', '', longest, tooLong, 'o\'brien+koma@demo.test'];
  for (const value of cases) {
    assert.equal(client.emailProblem(value) === null, registerBody.shape.email.safeParse(value).success, JSON.stringify(value));
  }
});

test('RN-12: el cliente acepta y rechaza los mismos nombres visibles que el servidor', () => {
  const cases = ['Al', 'Ana', '  Ana  ', '   ', 'a'.repeat(30), 'a'.repeat(31), '🙂'.repeat(3), '🙂'.repeat(30), '🙂'.repeat(31)];
  for (const value of cases) {
    assert.equal(client.displayNameProblem(value) === null, registerBody.shape.displayName.safeParse(value).success, JSON.stringify(value));
  }
});

test('Seguridad: safeNext del cliente devuelve lo mismo que el del servidor', () => {
  const cases: unknown[] = ['/', '/perfil', '/leer/pimienta/3#v-4', '//evil', '/\\evil.com', 'https://x', 'javascript:alert(1)', '/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/perfil\u007f', '/\u0000', '', 'perfil', undefined, null, 42, ['/perfil']];
  for (const value of cases) assert.equal(clientRedirect.safeNext(value), safeNext(value), JSON.stringify(value));
});

// "Repite la contraseña" (maqueta): solo en el cliente, sin equivalente en el servidor ni en el contrato.
test('RN-12: repetir la contraseña se comprueba solo en el cliente: vacía u otra distinta → error', () => {
  const password = 'contraseña-larga-1';
  assert.equal(client.passwordConfirmProblem(password, { password }), null);
  assert.equal(client.passwordConfirmProblem('', { password }), 'Este campo es obligatorio');
  assert.equal(client.passwordConfirmProblem(`${password} `, { password }), 'Las contraseñas no coinciden');
  assert.equal(client.passwordConfirmProblem(password, {}), 'Las contraseñas no coinciden');
});

// --- Catálogo (CU-01): la home valida q y tags antes de pedir /api/comics ---

test('Seguridad: el cliente usa los mismos límites del catálogo que el servidor', () => {
  assert.equal(clientCatalog.CATALOG_QUERY_MAX_LENGTH, CATALOG_QUERY_MAX_LENGTH);
  assert.equal(clientCatalog.CATALOG_MAX_TAGS, CATALOG_MAX_TAGS);
  assert.equal(clientCatalog.CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE);
});

test('Seguridad: el cliente acepta y rechaza las mismas búsquedas (q) que zod en el servidor', () => {
  const cases = ['', '   ', 'pimienta', '  pimienta  ', 'a'.repeat(100), 'a'.repeat(101), ` ${'a'.repeat(100)} `, 'ñ'.repeat(100), '🙂'.repeat(50), '🙂'.repeat(51), '50% off', 'a_b', 'c\\d', 'a\u0000b', '\u0000'];
  for (const value of cases) {
    assert.equal(clientCatalog.queryProblem(value) === null, catalogQuery.shape.q.safeParse(value).success, JSON.stringify(value));
  }
});

test('Seguridad: el cliente acepta y rechaza las mismas etiquetas (tags) que zod en el servidor', () => {
  const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);
  const cases = ['', 'fantasia', 'fantasia,magia', 'fantasia,fantasia', 'ciencia-ficcion', 'Fantasia', 'fantasía', 'a,,b', ',', 'a,', '-a', 'a-', 'a--b', 'a b', ten.join(','), [...ten, 't10'].join(','), [...ten, 't0'].join(',')];
  for (const value of cases) {
    assert.equal(clientCatalog.tagsProblem(value) === null, catalogQuery.shape.tags.safeParse(value).success, JSON.stringify(value));
  }
});

test('Seguridad: lo que la home envía a /api/comics desde una URL válida, el servidor lo acepta igual', () => {
  for (const query of ['', 'q=+pimienta+', 'tags=fantasia&tags=magia', 'tags=fantasia,magia,fantasia', 'q=a&tags=b&page=3', 'page=abc', 'page=0']) {
    const state = clientCatalog.readCatalogState(new URLSearchParams(query));
    const sent = new URLSearchParams(clientCatalog.catalogQueryString(state));
    const parsed = catalogQuery.safeParse(Object.fromEntries(sent));
    assert.ok(parsed.success, query);
    assert.deepEqual({ q: parsed.data.q, tags: parsed.data.tags, page: parsed.data.page }, state, query);
  }
});

// --- Textos del bloque 3 (utils/text.ts y config/limits.ts) ---

interface ClientText {
  COMMENT_BODY_MAX: number;
  commentProblem: (value: string) => string | null;
  textProblem: (value: string, rule: { min: number; max: number; multiline?: boolean }) => string | null;
  textLength: (value: string, multiline?: boolean) => number;
}
const clientText = await load<ClientText>('utils/validate.js');
const TEXT_CASES = ['', '   ', 'a', '  hola  ', 'a\nb', 'a\r\nb', 'a\rb', 'a\tb', 'a\u0000b', 'a\u007fb', '😀'.repeat(500), '😀'.repeat(501), 'x'.repeat(500), 'x'.repeat(501), ` ${'x'.repeat(500)} `];

test('RN-11: el cliente valida el comentario igual que el servidor, con los mismos mensajes', () => {
  assert.equal(clientText.COMMENT_BODY_MAX, COMMENT_BODY_MAX);
  for (const value of TEXT_CASES) {
    const server = commentBody.shape.body.safeParse(value);
    const client = clientText.commentProblem(value);
    assert.equal(client === null, server.success, JSON.stringify(value));
    if (!server.success) assert.equal(client, server.error.issues[0]?.message, JSON.stringify(value));
  }
});

test('Seguridad: la regla de textos de una línea es la misma en el cliente y en el servidor', () => {
  const rule = { min: 3, max: 30 };
  for (const value of [...TEXT_CASES, 'ab', ' abc ']) {
    assert.equal(clientText.textProblem(value, rule), textProblem(normalizeText(value), rule), JSON.stringify(value));
  }
  assert.equal(clientText.textLength(' a\r\nb ', true), 3); // lo que contará el servidor
});
