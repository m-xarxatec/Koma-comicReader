import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createComic, createUser, type TestComic, type TestUser } from './reading-fixtures.js';

// Subidas, portada, capítulos y viñetas del autor (CU-29, CU-30; RN-05, RN-09, RN-10, RN-13; contrato del bloque 3)
// contra koma_test. El temporal de multer (os.tmpdir(), que lee TMPDIR) y el almacenamiento local son carpetas
// propias de este archivo: así se comprueba que no queda ningún archivo parcial.
const storageDir = mkdtempSync(path.join(tmpdir(), 'koma-chapters-storage-'));
const uploadTmp = mkdtempSync(path.join(tmpdir(), 'koma-chapters-tmp-'));
process.env['STORAGE_DRIVER'] = 'local';
process.env['STORAGE_LOCAL_DIR'] = storageDir;
process.env['TMPDIR'] = uploadTmp;

const srv = startTestServer();
after(async () => {
  await rm(storageDir, { recursive: true, force: true });
  await rm(uploadTmp, { recursive: true, force: true });
});

const db = async () => (await import('../../db/pool.js')).pool;

// --- Imágenes construidas byte a byte (como tests/unit/image.test.ts): lo que se comprueba es la firma ---
const bytes = (...parts: (number | string | readonly number[])[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'number' ? [part] : typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : [...part])));
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const png = (width = 800, height = 1200) =>
  bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(width), be32(height), 8, 6, 0, 0, 0, be32(0));
const jpeg = (width: number, height: number) =>
  bytes(0xff, 0xd8, 0xff, 0xe0, be16(16), 'JFIF', 0, 1, 1, 0, be16(1), be16(1), 0, 0, 0xff, 0xc0, be16(17), 8, be16(height), be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xda, be16(8), 1, 1, 0, 0, 0x3f, 0);
const webp = (width: number, height: number) => {
  const payload = bytes(0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, le16(width), le16(height), 0, 0);
  return bytes('RIFF', le16(payload.length + 12), 0, 0, 'WEBP', 'VP8 ', le16(payload.length), 0, 0, [...payload]);
};

interface PanelBody {
  position: number;
  url: string;
  width: number;
  height: number;
}
interface ChapterBody {
  number: number;
  title: string;
  status: string;
  rejectionReason: string | null;
  panelCount: number;
  publishedAt: string | null;
  panels: PanelBody[];
}

const base = (slug: string) => `/api/author/comics/${slug}/chapters`;
const chapterUrl = (slug: string, number: number | string) => `${base(slug)}/${number}`;
const panelUrl = (slug: string, number: number, position: number | string) => `${chapterUrl(slug, number)}/panels/${position}`;

// multipart/form-data con el Origin permitido. `files`: [campo, contenido, nombre]; `fields`: campos de texto.
function upload(url: string, user: TestUser | null, files: [string, Uint8Array, string][] = [], fields: [string, string][] = [], method = 'POST') {
  const form = new FormData();
  for (const [name, value] of fields) form.append(name, value);
  for (const [name, content, filename] of files) form.append(name, new Blob([content]), filename);
  return fetch(`${srv.baseUrl}${url}`, { method, headers: { Origin: srv.origin, ...(user && { Cookie: user.cookie }) }, body: form });
}
const uploadPanel = (slug: string, number: number, user: TestUser | null, image: Uint8Array = png(), name = 'vineta.png') =>
  upload(`${chapterUrl(slug, number)}/panels`, user, [['image', image, name]]);
const uploadCover = (slug: string, user: TestUser | null, image: Uint8Array = png(600, 900)) =>
  upload(`/api/author/comics/${slug}/cover`, user, [['image', image, 'portada.png']], [], 'PUT');

const createChapter = (slug: string, user: TestUser | null, body: unknown) => api(srv, 'POST', base(slug), { body, ...(user && { cookie: user.cookie }) });
const getChapter = async (slug: string, number: number, user: TestUser) => {
  const res = await api(srv, 'GET', chapterUrl(slug, number), { cookie: user.cookie });
  assert.equal(res.status, 200);
  return ((await res.json()) as { chapter: ChapterBody }).chapter;
};
const move = (slug: string, number: number, from: number | string, to: unknown, user: TestUser) =>
  api(srv, 'PATCH', panelUrl(slug, number, from), { body: { position: to }, cookie: user.cookie });

async function assertError(res: Response, status: number, code: string, field?: string) {
  assert.equal(res.status, status, `${res.url}: ${await res.clone().text()}`);
  const body = (await res.json()) as { code: string; message: string; fields?: Record<string, string> };
  assert.equal(body.code, code);
  if (field) assert.ok(body.fields?.[field], `fields.${field} en ${JSON.stringify(body.fields)}`);
  return body;
}

async function auditOf(res: Response) {
  const { findByRequestId } = await import('../../modules/audit/audit.repository.js');
  return findByRequestId(await db(), res.headers.get('x-request-id') ?? '');
}

// Claves de las viñetas del capítulo vivo, por posición (para comprobar el orden tras borrar o mover).
async function panelKeys(comic: TestComic, number: number): Promise<string[]> {
  const { rows } = await (await db()).query<{ image_key: string }>(
    `SELECT p.image_key FROM panels p JOIN chapters ch ON ch.id = p.chapter_id
     WHERE ch.comic_id = $1 AND ch.number = $2 AND ch.deleted_at IS NULL AND ch.status <> 'rejected' ORDER BY p.position`,
    [comic.id, number],
  );
  return rows.map((row) => row.image_key);
}

const tmpFiles = () => readdirSync(uploadTmp);
const stored = (key: string) => existsSync(path.join(storageDir, key));

// Obra pending del autor con un borrador vacío (cap. 1) por defecto.
let comics = 0;
async function authorWithComic(chapters: Parameters<typeof createComic>[0]['chapters'] = [{ number: 1, status: 'draft', panels: 0 }]) {
  const author = await createUser('author');
  const comic = await createComic({ name: `capitulos-${++comics}`, authorId: author.id, status: 'pending', chapters });
  return { author, comic };
}

// ── Crear y consultar capítulos (CU-29) ───────────────────────────────────────

test('RN-05: crear un capítulo responde 201 en draft, con "Capítulo N" si no lleva título, y audita chapter.create', async () => {
  const { author, comic } = await authorWithComic([]);
  const res = await createChapter(comic.slug, author, { number: 3 });
  assert.equal(res.status, 201);
  const { chapter } = (await res.json()) as { chapter: ChapterBody };
  assert.deepEqual(chapter, { number: 3, title: 'Capítulo 3', status: 'draft', rejectionReason: null, panelCount: 0, publishedAt: null, panels: [] });
  const [entry] = await auditOf(res);
  assert.equal(entry?.action, 'chapter.create');
  assert.equal(entry?.actorId, author.id);
  assert.equal(entry?.entityType, 'chapters');
  assert.deepEqual(entry?.after, { comic: comic.slug, number: 3, title: 'Capítulo 3', status: 'draft' });

  const titled = await createChapter(comic.slug, author, { number: 4, title: '  El regreso  ' });
  assert.equal(((await titled.json()) as { chapter: ChapterBody }).chapter.title, 'El regreso');
});

test('RN-09: un número ocupado por un capítulo vivo da 409; el de un retirado o un rechazado se reutiliza', async () => {
  const { author, comic } = await authorWithComic([
    { number: 1 },
    { number: 2, status: 'pending' },
    { number: 3, withdrawn: true },
    { number: 4, status: 'rejected' },
  ]);
  for (const number of [1, 2]) {
    const body = await assertError(await createChapter(comic.slug, author, { number }), 409, 'CONFLICT');
    assert.equal(body.message, 'El número de capítulo ya está en uso');
  }
  for (const number of [3, 4]) assert.equal((await createChapter(comic.slug, author, { number })).status, 201, `cap. ${number}`);
  assert.equal((await getChapter(comic.slug, 4, author)).status, 'draft', 'el vivo es el nuevo, no el rechazado');
});

test('Seguridad: número y título de capítulo se validan (entero de 1 a 2³¹ − 1; título de 1 a 100) → 400', async () => {
  const { author, comic } = await authorWithComic([]);
  for (const number of [0, -1, 1.5, '1', 2_147_483_648, undefined]) {
    await assertError(await createChapter(comic.slug, author, { number }), 400, 'VALIDATION_ERROR', 'number');
  }
  for (const title of ['', '   ', 'x'.repeat(101), 'Con\u0000nulo', null]) {
    await assertError(await createChapter(comic.slug, author, { number: 1, title }), 400, 'VALIDATION_ERROR', 'title');
  }
  assert.equal((await createChapter(comic.slug, author, { number: 2_147_483_647 })).status, 201);
});

test('Seguridad: obra inexistente 404, ajena 403, retirada 410; sin sesión 401 y un lector 403', async () => {
  const { author, comic } = await authorWithComic();
  const other = await createUser('author');
  const withdrawn = await createComic({ name: 'capitulos-retirada', authorId: author.id, withdrawn: true, chapters: [{ number: 1, status: 'draft', panels: 0 }] });
  await assertError(await createChapter('no-existe-nunca', author, { number: 1 }), 404, 'NOT_FOUND');
  await assertError(await createChapter(comic.slug, other, { number: 2 }), 403, 'FORBIDDEN');
  await assertError(await createChapter(withdrawn.slug, author, { number: 2 }), 410, 'GONE');
  await assertError(await createChapter(comic.slug, null, { number: 2 }), 401, 'UNAUTHENTICATED');
  await assertError(await createChapter(comic.slug, await createUser('reader'), { number: 2 }), 403, 'FORBIDDEN');
  await assertError(await api(srv, 'GET', chapterUrl(comic.slug, 1), { cookie: other.cookie }), 403, 'FORBIDDEN');
  await assertError(await api(srv, 'GET', chapterUrl(comic.slug, 9), { cookie: author.cookie }), 404, 'NOT_FOUND');
  await assertError(await api(srv, 'GET', chapterUrl(comic.slug, '01'), { cookie: author.cookie }), 404, 'NOT_FOUND');
});

test('D8: en una obra rechazada no se crean capítulos ni se suben portada o viñetas (409); sí se consultan', async () => {
  const { author, comic } = await authorWithComic();
  await (await db()).query(`UPDATE comics SET status = 'rejected', rejection_reason = 'Motivo' WHERE id = $1`, [comic.id]);
  await assertError(await createChapter(comic.slug, author, { number: 2 }), 409, 'CONFLICT');
  await assertError(await uploadCover(comic.slug, author), 409, 'CONFLICT');
  await assertError(await uploadPanel(comic.slug, 1, author), 409, 'CONFLICT');
  assert.equal((await getChapter(comic.slug, 1, author)).status, 'draft');
  assert.deepEqual(tmpFiles(), []);
});

// ── Subir viñetas (RN-10, RN-13) ──────────────────────────────────────────────

test('RN-10: cada viñeta va al final, con el ancho y el alto de su cabecera; JPEG, PNG y WebP', async () => {
  const { author, comic } = await authorWithComic();
  const cases: [Uint8Array, string, number, number][] = [
    [png(800, 1200), 'a.png', 800, 1200],
    [jpeg(640, 2000), 'b.jpg', 640, 2000],
    [webp(720, 1280), 'c.webp', 720, 1280],
  ];
  for (const [index, [image, name, width, height]] of cases.entries()) {
    const res = await uploadPanel(comic.slug, 1, author, image, name);
    assert.equal(res.status, 201, await res.clone().text());
    const { panel } = (await res.json()) as { panel: PanelBody };
    assert.deepEqual(Object.keys(panel).sort(), ['height', 'position', 'url', 'width']);
    assert.equal(panel.position, index + 1);
    assert.equal(panel.width, width);
    assert.equal(panel.height, height);
    assert.match(panel.url, /^\/files\/[0-9a-f-]{36}\.(png|jpg|webp)\?exp=\d+&sig=/);
  }
  const keys = await panelKeys(comic, 1);
  assert.deepEqual(keys.map((key) => key.split('.')[1]), ['png', 'jpg', 'webp'], 'la extensión sale de la firma');
  assert.ok(keys.every(stored), 'las imágenes están en el almacenamiento');
  assert.deepEqual(tmpFiles(), [], 'el temporal de multer se borra siempre');
  const chapter = await getChapter(comic.slug, 1, author);
  assert.equal(chapter.panelCount, 3);
  assert.deepEqual(chapter.panels.map((panel) => panel.position), [1, 2, 3]);
});

test('RN-10: un archivo que no es JPEG, PNG ni WebP por su firma da 415, aunque se llame .png; no se guarda nada', async () => {
  const { author, comic } = await authorWithComic();
  const before = readdirSync(storageDir).length;
  for (const [image, name] of [
    [new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'falsa.png'],
    [bytes('GIF89a', 1, 0, 1, 0), 'animada.gif'],
    [png(0, 10), 'cero.png'],
  ] as const) {
    await assertError(await uploadPanel(comic.slug, 1, author, image, name), 415, 'UNSUPPORTED_FILE');
  }
  assert.equal(readdirSync(storageDir).length, before);
  assert.deepEqual(await panelKeys(comic, 1), []);
  assert.deepEqual(tmpFiles(), []);
});

test('RN-10: una imagen de más de 5 MB da 413 FILE_TOO_LARGE y no deja el archivo parcial en el temporal', async () => {
  const { author, comic } = await authorWithComic();
  const big = new Uint8Array(5 * 1024 * 1024 + 1);
  big.set(png());
  await assertError(await uploadPanel(comic.slug, 1, author, big), 413, 'FILE_TOO_LARGE');
  assert.deepEqual(tmpFiles(), []);
  // Exactamente 5 MB vale.
  const limit = new Uint8Array(5 * 1024 * 1024);
  limit.set(png());
  assert.equal((await uploadPanel(comic.slug, 1, author, limit)).status, 201);
  assert.deepEqual(tmpFiles(), []);
});

test('Seguridad: sin archivo, con dos, con otro campo o con campos de texto da 400 en fields.image y no deja nada', async () => {
  const { author, comic } = await authorWithComic();
  const url = `${chapterUrl(comic.slug, 1)}/panels`;
  await assertError(await upload(url, author), 400, 'VALIDATION_ERROR', 'image');
  await assertError(await upload(url, author, [['image', png(), 'a.png'], ['image', png(), 'b.png']]), 400, 'VALIDATION_ERROR', 'image');
  await assertError(await upload(url, author, [['foto', png(), 'a.png']]), 400, 'VALIDATION_ERROR', 'image');
  await assertError(await upload(url, author, [['image', png(), 'a.png']], [['title', 'x']]), 400, 'VALIDATION_ERROR', 'image');
  // Una petición que no es multipart/form-data llega sin archivo.
  await assertError(await api(srv, 'POST', url, { body: { image: 'x' }, cookie: author.cookie }), 400, 'VALIDATION_ERROR', 'image');
  assert.deepEqual(await panelKeys(comic, 1), []);
  assert.deepEqual(tmpFiles(), []);
});

test('Seguridad: un multipart cortado o sin boundary da 400 (no 500) y no deja el archivo parcial', async () => {
  const { author, comic } = await authorWithComic();
  const url = `${srv.baseUrl}${chapterUrl(comic.slug, 1)}/panels`;
  const head = '--x\r\nContent-Disposition: form-data; name="image"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n';
  const truncated = new Uint8Array([...new TextEncoder().encode(head), ...png()]);
  for (const [contentType, body] of [
    ['multipart/form-data; boundary=x', truncated],
    ['multipart/form-data', truncated],
  ] as const) {
    const res = await fetch(url, { method: 'POST', headers: { Origin: srv.origin, Cookie: author.cookie, 'Content-Type': contentType }, body });
    await assertError(res, 400, 'VALIDATION_ERROR');
  }
  assert.deepEqual(await panelKeys(comic, 1), []);
  assert.deepEqual(tmpFiles(), []);
});

test('RN-10: la viñeta 61 de un capítulo da 400 sin escribir en disco', async () => {
  const { author, comic } = await authorWithComic([{ number: 1, status: 'draft', panels: 60 }]);
  const body = await assertError(await uploadPanel(comic.slug, 1, author), 400, 'VALIDATION_ERROR', 'image');
  assert.equal(body.fields?.['image'], 'Un capítulo admite como mucho 60 viñetas');
  assert.equal((await panelKeys(comic, 1)).length, 60);
  assert.deepEqual(tmpFiles(), []);
});

test('Seguridad: subir a una obra ajena da 403 y a un capítulo que no es borrador, 409, sin escribir en disco', async () => {
  const { author, comic } = await authorWithComic([{ number: 1, status: 'draft', panels: 0 }, { number: 2, status: 'pending' }, { number: 3 }]);
  const other = await createUser('author');
  await assertError(await uploadPanel(comic.slug, 1, other), 403, 'FORBIDDEN');
  await assertError(await uploadPanel(comic.slug, 2, author), 409, 'CONFLICT');
  await assertError(await uploadPanel(comic.slug, 3, author), 409, 'CONFLICT');
  await assertError(await uploadPanel(comic.slug, 9, author), 404, 'NOT_FOUND');
  await assertError(await uploadPanel(comic.slug, 1, null), 401, 'UNAUTHENTICATED');
  await assertError(await uploadPanel(comic.slug, 1, await createUser('admin')), 403, 'FORBIDDEN');
  assert.deepEqual(tmpFiles(), []);
});

test('Seguridad: subir exige el Origin propio (CSRF)', async () => {
  const { author, comic } = await authorWithComic();
  const form = new FormData();
  form.append('image', new Blob([png()]), 'a.png');
  const res = await fetch(`${srv.baseUrl}${chapterUrl(comic.slug, 1)}/panels`, { method: 'POST', headers: { Cookie: author.cookie }, body: form });
  await assertError(res, 403, 'CSRF');
  assert.deepEqual(tmpFiles(), []);
});

test('RN-13: la subida 101 en una hora da 429 (cuenta cada intento validado, portada incluida)', async () => {
  const { author, comic } = await authorWithComic();
  const url = `${chapterUrl(comic.slug, 1)}/panels`;
  assert.equal((await uploadCover(comic.slug, author)).status, 200);
  for (let i = 0; i < 99; i++) assert.equal((await upload(url, author)).status, 400, `intento ${i + 2}`);
  const res = await uploadPanel(comic.slug, 1, author);
  const body = (await assertError(res, 429, 'RATE_LIMITED')) as unknown as { retryAt: string };
  assert.ok(Number(res.headers.get('retry-after')) > 0);
  assert.ok(Date.parse(body.retryAt) > Date.now());
  assert.deepEqual(tmpFiles(), []);
  // Otro autor no está limitado.
  const other = await authorWithComic();
  assert.equal((await uploadPanel(other.comic.slug, 1, other.author)).status, 201);
});

// ── Eliminar y reordenar viñetas (RN-05, D9) ──────────────────────────────────

test('RN-05: eliminar una viñeta de un borrador recompacta las posiciones y borra su imagen del almacenamiento', async () => {
  const { author, comic } = await authorWithComic();
  for (let i = 0; i < 3; i++) assert.equal((await uploadPanel(comic.slug, 1, author)).status, 201);
  const [first, second, third] = await panelKeys(comic, 1);
  const res = await api(srv, 'DELETE', panelUrl(comic.slug, 1, 2), { cookie: author.cookie });
  assert.equal(res.status, 204);
  assert.deepEqual(await auditOf(res), [], 'sin auditoría: el borrador nunca fue público');
  assert.deepEqual(await panelKeys(comic, 1), [first, third]);
  assert.equal(stored(second!), false);
  assert.ok(stored(first!) && stored(third!));
  const chapter = await getChapter(comic.slug, 1, author);
  assert.deepEqual(chapter.panels.map((panel) => panel.position), [1, 2]);
  await assertError(await api(srv, 'DELETE', panelUrl(comic.slug, 1, 3), { cookie: author.cookie }), 404, 'NOT_FOUND');
});

test('RN-05: fuera de borrador no se eliminan ni se mueven viñetas (409); en una obra ajena, 403', async () => {
  const { author, comic } = await authorWithComic([{ number: 1, status: 'pending', panels: 2 }, { number: 2, panels: 2 }]);
  const other = await createUser('author');
  for (const number of [1, 2]) {
    await assertError(await api(srv, 'DELETE', panelUrl(comic.slug, number, 1), { cookie: author.cookie }), 409, 'CONFLICT');
    await assertError(await move(comic.slug, number, 1, 2, author), 409, 'CONFLICT');
    await assertError(await api(srv, 'DELETE', panelUrl(comic.slug, number, 1), { cookie: other.cookie }), 403, 'FORBIDDEN');
    await assertError(await move(comic.slug, number, 1, 2, other), 403, 'FORBIDDEN');
  }
  assert.equal((await panelKeys(comic, 1)).length, 2);
});

test('D9: mover una viñeta arriba, abajo o a la misma posición desplaza las intermedias; fuera de 1…n, 400', async () => {
  const { author, comic } = await authorWithComic([{ number: 1, status: 'draft', panels: 4 }]);
  const [a, b, c, d] = await panelKeys(comic, 1);

  // Arriba: la 3.ª pasa a la 1.ª.
  let res = await move(comic.slug, 1, 3, 1, author);
  assert.equal(res.status, 200);
  assert.deepEqual(((await res.json()) as { chapter: ChapterBody }).chapter.panels.map((panel) => panel.position), [1, 2, 3, 4]);
  assert.deepEqual(await panelKeys(comic, 1), [c, a, b, d]);
  assert.deepEqual(await auditOf(res), []);

  // Abajo: la 1.ª pasa a la 4.ª.
  assert.equal((await move(comic.slug, 1, 1, 4, author)).status, 200);
  assert.deepEqual(await panelKeys(comic, 1), [a, b, d, c]);

  // A la misma posición: 200 sin cambios.
  res = await move(comic.slug, 1, 2, 2, author);
  assert.equal(res.status, 200);
  assert.deepEqual(await panelKeys(comic, 1), [a, b, d, c]);

  // Fuera de rango.
  const body = await assertError(await move(comic.slug, 1, 1, 5, author), 400, 'VALIDATION_ERROR', 'position');
  assert.equal(body.fields?.['position'], 'La posición debe estar entre 1 y 4');
  for (const to of [0, -1, 1.5, '2', undefined]) await assertError(await move(comic.slug, 1, 1, to, author), 400, 'VALIDATION_ERROR', 'position');
  await assertError(await move(comic.slug, 1, 9, 1, author), 404, 'NOT_FOUND');
  await assertError(await move(comic.slug, 1, '0', 1, author), 404, 'NOT_FOUND');
  assert.deepEqual(await panelKeys(comic, 1), [a, b, d, c]);
});

// ── Enviar a revisión (RN-05) ─────────────────────────────────────────────────

test('RN-05: enviar un borrador sin viñetas da 400; con viñetas pasa a pending, audita chapter.submit y ya no se edita', async () => {
  const { author, comic } = await authorWithComic();
  const submit = () => api(srv, 'POST', `${chapterUrl(comic.slug, 1)}/submit`, { cookie: author.cookie });
  await assertError(await submit(), 400, 'VALIDATION_ERROR');
  assert.equal((await uploadPanel(comic.slug, 1, author)).status, 201);
  const res = await submit();
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { chapter: ChapterBody }).chapter.status, 'pending');
  const [entry] = await auditOf(res);
  assert.equal(entry?.action, 'chapter.submit');
  assert.deepEqual(entry?.before, { status: 'draft' });
  assert.deepEqual(entry?.after, { status: 'pending' });
  await assertError(await submit(), 409, 'CONFLICT');
  await assertError(await uploadPanel(comic.slug, 1, author), 409, 'CONFLICT');
  assert.deepEqual(tmpFiles(), []);
});

// ── Portada (D7) ──────────────────────────────────────────────────────────────

test('D7: la portada se sube con clave nueva, se audita como comic.update y la anterior se borra del almacenamiento', async () => {
  const { author, comic } = await authorWithComic([]);
  const first = await uploadCover(comic.slug, author);
  assert.equal(first.status, 200);
  const { comic: dto } = (await first.json()) as { comic: { slug: string; coverUrl: string | null } };
  assert.equal(dto.slug, comic.slug);
  assert.match(dto.coverUrl ?? '', /^\/files\/[0-9a-f-]{36}\.png\?exp=/);
  const keyOf = async () => (await (await db()).query<{ cover_key: string }>('SELECT cover_key FROM comics WHERE id = $1', [comic.id])).rows[0]!.cover_key;
  const firstKey = await keyOf();
  assert.ok(stored(firstKey));
  const [created] = await auditOf(first);
  assert.equal(created?.action, 'comic.update');
  assert.deepEqual(created?.before, { coverKey: null });
  assert.deepEqual(created?.after, { coverKey: firstKey });

  const second = await uploadCover(comic.slug, author, jpeg(600, 900));
  assert.equal(second.status, 200);
  const secondKey = await keyOf();
  assert.notEqual(secondKey, firstKey);
  assert.match(secondKey, /\.jpg$/);
  assert.equal(stored(firstKey), false, 'la anterior se borra después del COMMIT');
  assert.ok(stored(secondKey));
  assert.deepEqual((await auditOf(second))[0]?.before, { coverKey: firstKey });

  await assertError(await uploadCover(comic.slug, author, bytes('no es una imagen')), 415, 'UNSUPPORTED_FILE');
  await assertError(await uploadCover(comic.slug, await createUser('author')), 403, 'FORBIDDEN');
  await assertError(await upload(`/api/author/comics/${comic.slug}/cover`, author, [], [], 'PUT'), 400, 'VALIDATION_ERROR', 'image');
  assert.equal(await keyOf(), secondKey);
  assert.deepEqual(tmpFiles(), []);
});
