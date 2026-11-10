import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';
import * as limits from '../../config/limits.js';
import { CATALOG_MAX_TAGS, CATALOG_PAGE_SIZE, CATALOG_QUERY_MAX_LENGTH, COMMENT_BODY_MAX } from '../../config/limits.js';
import { EMAIL_MAX_CHARS, passwordBody, registerBody } from '../../modules/auth/auth.schema.js';
import { createChapterBody } from '../../modules/chapters/chapters.schema.js';
import { catalogQuery, createComicBody } from '../../modules/comics/comics.schema.js';
import { commentBody } from '../../modules/comments/comments.schema.js';
import { profileBody } from '../../modules/users/users.schema.js';
import { readingSettingsBody, rejectBody } from '../../modules/admin/admin.schema.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../modules/audit/audit.service.js';
import { passwordProblem } from '../../utils/password.js';
import { safeNext } from '../../utils/redirect.js';
import { initials as serverInitials, normalizeText, textProblem } from '../../utils/text.js';

// El cliente duplica de forma explícita las reglas del servidor (no hay bundler: zod no llega al navegador).
// Este test carga el JS compilado del cliente (client/dist, lo genera `tsc -b`) y le pasa los mismos casos.

type Problem = (value: string) => string | null;
interface ClientValidate {
  emailProblem: Problem;
  displayNameProblem: Problem;
  passwordProblem: Problem;
  currentPasswordProblem: Problem;
  passwordConfirmProblem: (value: string, values: Readonly<Record<string, string>>) => string | null;
  confirmationOf: (field: string) => (value: string, values: Readonly<Record<string, string>>) => string | null;
  initials: (displayName: string) => string;
  COMIC_TITLE_MAX: number;
  COMIC_SYNOPSIS_MAX: number;
  AUTHOR_CREDIT_MAX: number;
  CONTENT_WARNING_MAX: number;
  CHAPTER_TITLE_MAX: number;
  COMIC_TAGS_MAX: number;
  MAX_IMAGE_BYTES: number;
  IMAGE_TOO_LARGE: string;
  MAX_PANELS_PER_CHAPTER: number;
  PG_MAX_INT: number;
  comicTitleProblem: Problem;
  synopsisProblem: Problem;
  authorCreditProblem: Problem;
  contentWarningProblem: Problem;
  chapterTitleProblem: Problem;
  chapterNumberProblem: Problem;
  tagsProblem: (selected: readonly { type: 'genre' | 'theme' }[]) => string | null;
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

test('RN-12: en el perfil, "Repite la nueva contraseña" se compara con newPassword, no con password', () => {
  const newPassword = 'contraseña-nueva-1';
  const confirm = client.confirmationOf('newPassword');
  assert.equal(confirm(newPassword, { newPassword }), null);
  assert.equal(confirm('', { newPassword }), 'Este campo es obligatorio');
  assert.equal(confirm(newPassword, { password: newPassword }), 'Las contraseñas no coinciden');
  assert.equal(confirm(newPassword, { newPassword, currentPassword: 'otra-contraseña' }), null);
});

test('RN-12: el cliente acepta y rechaza las mismas contraseñas del perfil que el servidor (actual y nueva)', () => {
  const cases = ['', 'corta', '123456789', '1234567890', 'ñ'.repeat(36), 'ñ'.repeat(37), '🙂'.repeat(18), '🙂'.repeat(19), 'x'.repeat(72), 'x'.repeat(73)];
  for (const value of cases) {
    const server = (field: 'currentPassword' | 'newPassword') => passwordBody.shape[field].safeParse(value).success;
    assert.equal(client.passwordProblem(value) === null, server('newPassword'), `newPassword ${JSON.stringify(value)}`);
    assert.equal(client.currentPasswordProblem(value) === null, server('currentPassword'), `currentPassword ${JSON.stringify(value)}`);
  }
});

test('RN-12: el nombre del perfil (PATCH /api/me) sigue la misma regla que el del registro', () => {
  const cases = ['Al', 'Ana', '  Ana  ', 'a'.repeat(30), 'a'.repeat(31), '🙂'.repeat(30), '🙂'.repeat(31), 'An\u0000a', 'An\u0007a'];
  for (const value of cases) {
    assert.equal(client.displayNameProblem(value) === null, profileBody.shape.displayName.safeParse(value).success, JSON.stringify(value));
  }
});

test('Seguridad: el cliente rechaza los mismos caracteres de control en el nombre visible que el servidor, con su mensaje', () => {
  const cases = ['Ana\u0000', '\u0000Ana', 'An\u0007a', 'Ana\nLópez', 'Ana\tLópez', 'Ana\u007f', 'Ana\u0085x', '  Ana\t ', 'Ana López', 'Zoë 🙂'];
  for (const value of cases) {
    for (const schema of [registerBody.shape.displayName, profileBody.shape.displayName]) {
      const server = schema.safeParse(value);
      const message = server.success ? null : server.error.issues[0]!.message;
      assert.equal(client.displayNameProblem(value), message, JSON.stringify(value));
    }
  }
  assert.equal(client.displayNameProblem('An\u0000a'), 'Contiene caracteres no válidos');
  assert.equal(client.displayNameProblem('  Ana\t '), null, 'los extremos se recortan antes de comprobar');
});

test('Seguridad: initials() da lo mismo en el cliente y en el servidor (avatar del perfil, D17)', () => {
  const cases = ['Ana', 'ana lópez', '  Ana   María  López ', 'élan vital', '🙂 Feliz', 'x', '<img src=x>', 'ßeta ǆungla', 'İzmir', ''];
  for (const value of cases) assert.equal(client.initials(value), serverInitials(value), JSON.stringify(value));
  assert.equal(serverInitials('ana lópez'), 'AL');
  assert.equal(serverInitials('🙂 Feliz'), '🙂F');
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

// --- Estudio del autor (contrato del bloque 3, D5): /autor valida antes de llamar a la API ---

test('Seguridad: el cliente usa los mismos límites de obras, capítulos y subidas que el servidor', () => {
  assert.equal(client.COMIC_TITLE_MAX, limits.COMIC_TITLE_MAX);
  assert.equal(client.COMIC_SYNOPSIS_MAX, limits.COMIC_SYNOPSIS_MAX);
  assert.equal(client.AUTHOR_CREDIT_MAX, limits.AUTHOR_CREDIT_MAX);
  assert.equal(client.CONTENT_WARNING_MAX, limits.CONTENT_WARNING_MAX);
  assert.equal(client.CHAPTER_TITLE_MAX, limits.CHAPTER_TITLE_MAX);
  assert.equal(client.COMIC_TAGS_MAX, limits.COMIC_TAGS_MAX);
  assert.equal(client.MAX_IMAGE_BYTES, limits.MAX_IMAGE_BYTES);
  // El aviso del cliente antes de subir es el mismo texto que el 413 FILE_TOO_LARGE de error-handler.ts.
  assert.equal(client.IMAGE_TOO_LARGE, `La imagen no puede pasar de ${limits.MAX_IMAGE_BYTES / (1024 * 1024)} MB`);
  assert.equal(client.MAX_PANELS_PER_CHAPTER, limits.MAX_PANELS_PER_CHAPTER);
  assert.equal(client.PG_MAX_INT, limits.PG_MAX_INT);
});

test('Seguridad: título, sinopsis, autor original y advertencia se aceptan y rechazan igual que en el servidor, con su mensaje', () => {
  const cases = ['', '   ', 'Obra', '  Obra  ', 'x'.repeat(100), 'x'.repeat(101), '🙂'.repeat(100), '🙂'.repeat(101), 'Dos\nlíneas', 'Con\u0000nulo', 'Con\ttab', 'x'.repeat(200), 'x'.repeat(201), 'x'.repeat(1000), 'x'.repeat(1001), 'a\r\nb'];
  const fields = [
    ['title', client.comicTitleProblem],
    ['synopsis', client.synopsisProblem],
    ['authorCredit', client.authorCreditProblem],
  ] as const;
  for (const [field, rule] of fields) {
    for (const value of cases) {
      const server = createComicBody.shape[field].safeParse(value);
      assert.equal(rule(value), server.success ? null : server.error.issues[0]!.message, `${field} ${JSON.stringify(value)}`);
    }
  }
  // contentWarning admite null en el servidor; el cliente solo valida el texto cuando se marca la casilla.
  for (const value of cases) {
    const server = createComicBody.shape.contentWarning.safeParse(value);
    assert.equal(client.contentWarningProblem(value), server.success ? null : server.error.issues[0]!.message, `contentWarning ${JSON.stringify(value)}`);
  }
});

test('Seguridad: número y título de capítulo se aceptan y rechazan igual que en el servidor (el título vacío = sin título)', () => {
  for (const value of ['', ' ', '0', '1', '01', ' 7 ', '1.5', '-1', 'abc', '2147483647', '2147483648', '99999999999']) {
    const parsed = /^\s*\d+\s*$/.test(value) ? Number(value.trim()) : value;
    const server = createChapterBody.shape.number.safeParse(parsed);
    assert.equal(client.chapterNumberProblem(value) === null, server.success, `number ${JSON.stringify(value)}`);
  }
  for (const value of ['Uno', '  Uno  ', 'x'.repeat(100), 'x'.repeat(101), 'Con\u0000nulo']) {
    const server = createChapterBody.shape.title.safeParse(value);
    assert.equal(client.chapterTitleProblem(value), server.success ? null : server.error.issues[0]!.message, `title ${JSON.stringify(value)}`);
  }
  assert.equal(client.chapterTitleProblem('   '), null, 'vacío: el cliente no envía título y el servidor pone «Capítulo N»');
});

test('Seguridad: las etiquetas del cliente siguen D5 con los mensajes del servidor (1–10 y al menos un género)', () => {
  const genre = { type: 'genre' } as const;
  const theme = { type: 'theme' } as const;
  assert.equal(client.tagsProblem([]), createComicBody.shape.tags.safeParse([]).error?.issues[0]?.message);
  assert.equal(client.tagsProblem(Array.from({ length: 11 }, () => genre)), createComicBody.shape.tags.safeParse(Array.from({ length: 11 }, (_, i) => `t${i}`)).error?.issues[0]?.message);
  assert.equal(client.tagsProblem([theme, theme]), 'Elige al menos un género');
  assert.equal(client.tagsProblem([theme, genre]), null);
  assert.equal(client.tagsProblem(Array.from({ length: 10 }, () => genre)), null);
});

// --- Bloque 4: panel del admin (client/src/utils/admin.ts) ---

interface ClientAdmin {
  REJECTION_REASON_MAX: number;
  ADMIN_QUERY_MAX_LENGTH: number;
  READING_SETTINGS_RANGES: Record<'waitMinutes' | 'maxBalance' | 'refill', { min: number; max: number }>;
  AUDIT_ACTIONS: readonly string[];
  AUDIT_ENTITY_TYPES: Record<string, string>;
  reasonProblem: Problem;
  settingProblem: (field: 'waitMinutes' | 'maxBalance' | 'refill', raw: string) => string | null;
  auditEntityLabel: (entityType: string, entityId: string | null) => string;
  lastPage: (total: number, pageSize: number) => number;
  canApprove: (comic: { isAdult: boolean }, chapter: object | null) => boolean;
}
const clientAdmin = await load<ClientAdmin>('utils/admin.js');

test('Seguridad: el panel del admin usa los mismos límites, acciones y entidades de auditoría que el servidor', () => {
  assert.equal(clientAdmin.REJECTION_REASON_MAX, limits.REJECTION_REASON_MAX);
  assert.equal(clientAdmin.ADMIN_QUERY_MAX_LENGTH, limits.ADMIN_QUERY_MAX_LENGTH);
  for (const field of ['waitMinutes', 'maxBalance', 'refill'] as const) {
    assert.equal(clientAdmin.READING_SETTINGS_RANGES[field].min, limits.READING_SETTINGS_RANGES[field].min, field);
    assert.equal(clientAdmin.READING_SETTINGS_RANGES[field].max, limits.READING_SETTINGS_RANGES[field].max, field);
  }
  assert.deepEqual([...clientAdmin.AUDIT_ACTIONS], [...AUDIT_ACTIONS]);
  assert.deepEqual(Object.keys(clientAdmin.AUDIT_ENTITY_TYPES), [...AUDIT_ENTITY_TYPES]);
});

test('RN-05: el motivo de rechazo se acepta y rechaza igual que en el servidor, con su mensaje', () => {
  for (const value of ['', '   ', 'Motivo', 'x'.repeat(500), 'x'.repeat(501), '🙂'.repeat(500), 'línea\nsegunda', 'con\u0007control']) {
    const server = rejectBody.safeParse({ reason: value });
    const expected = server.success ? null : server.error.issues[0]!.message;
    assert.equal(clientAdmin.reasonProblem(value), expected, JSON.stringify(value).slice(0, 30));
  }
});

test('RN-16: los parámetros se aceptan y rechazan igual que en el servidor, con su mensaje', () => {
  const valid = { waitMinutes: 1, maxBalance: 5, refill: 2 };
  for (const field of ['waitMinutes', 'maxBalance', 'refill'] as const) {
    const { min, max } = limits.READING_SETTINGS_RANGES[field];
    for (const value of [min - 1, min, max, max + 1]) {
      const server = readingSettingsBody.safeParse({ ...valid, [field]: value });
      const expected = server.success ? null : server.error.issues[0]!.message;
      assert.equal(clientAdmin.settingProblem(field, String(value)), expected, `${field}=${value}`);
    }
    // El cliente envía Number(valor): un decimal no es un entero en ninguno de los dos.
    assert.equal(clientAdmin.settingProblem(field, '1.5'), 'Debe ser un número entero');
    assert.equal(readingSettingsBody.safeParse({ ...valid, [field]: 1.5 }).error?.issues[0]?.message, 'Debe ser un número entero');
  }
});

// --- Pulido: bajos funcionales de /admin (D8) ---

test('Seguridad: (CU-40) la auditoría muestra la entidad con su nombre en español y su id, no la tabla en crudo', () => {
  for (const entityType of AUDIT_ENTITY_TYPES) {
    const label = clientAdmin.AUDIT_ENTITY_TYPES[entityType];
    assert.ok(label && label !== entityType, entityType);
    assert.equal(clientAdmin.auditEntityLabel(entityType, '12'), `${label} #12`);
    assert.equal(clientAdmin.auditEntityLabel(entityType, null), label);
  }
  assert.equal(clientAdmin.auditEntityLabel('desconocida', '3'), 'desconocida #3');
  assert.equal(clientAdmin.auditEntityLabel('toString', null), 'toString', 'solo claves propias, no las heredadas');
});

test('Seguridad: la paginación del admin nunca pide ni muestra una página que no existe («Página 3 de 2»)', () => {
  assert.equal(clientAdmin.lastPage(0, 50), 1);
  assert.equal(clientAdmin.lastPage(1, 50), 1);
  assert.equal(clientAdmin.lastPage(50, 50), 1);
  assert.equal(clientAdmin.lastPage(51, 50), 2);
  assert.equal(clientAdmin.lastPage(100, 50), 2, 'al eliminar el único elemento de la página 3, se vuelve a la 2');
});

test('RN-17: el panel no ofrece «Aprobar» en una obra +18; en sus capítulos y en las demás obras, sí', () => {
  const chapter = { number: 1, title: 'Uno', panelCount: 1 };
  assert.equal(clientAdmin.canApprove({ isAdult: true }, null), false);
  assert.equal(clientAdmin.canApprove({ isAdult: false }, null), true);
  assert.equal(clientAdmin.canApprove({ isAdult: true }, chapter), true, 'el servidor lo admite con la obra en pending (D2)');
  assert.equal(clientAdmin.canApprove({ isAdult: false }, chapter), true);
});

test('Seguridad: los límites escritos en admin.html coinciden con los del servidor, y «Filtrar» espera a JS', () => {
  const html = readFileSync(path.join(paths.publicDir, 'pages', 'admin.html'), 'utf8');
  const attr = (id: string, name: string) => {
    const tag = html.match(new RegExp(`<(?:input|textarea)[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? '';
    return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  };
  const settings = { waitMinutes: 'setting-wait', maxBalance: 'setting-max', refill: 'setting-refill' } as const;
  for (const [field, id] of Object.entries(settings) as [keyof typeof settings, string][]) {
    const { min, max } = limits.READING_SETTINGS_RANGES[field];
    assert.equal(attr(id, 'min'), String(min), `${id} min`);
    assert.equal(attr(id, 'max'), String(max), `${id} max`);
    assert.match(html, new RegExp(`id="${id}-hint">De ${min} a ${max}\\.`), `${id} pista`);
  }
  for (const id of ['comments-q', 'users-q']) assert.equal(attr(id, 'maxlength'), String(limits.ADMIN_QUERY_MAX_LENGTH), id);
  assert.equal(attr('audit-actor', 'maxlength'), String(EMAIL_MAX_CHARS));
  assert.equal(attr('audit-entity-id', 'maxlength'), String(limits.AUDIT_ENTITY_ID_MAX));
  assert.match(html, new RegExp(`id="admin-reason-hint">De 1 a ${limits.REJECTION_REASON_MAX} caracteres\\.`));
  assert.equal((html.match(/type="submit" disabled data-needs-js>Filtrar</g) ?? []).length, 3);
  assert.ok(!html.includes('type="submit">Filtrar<'));
});
