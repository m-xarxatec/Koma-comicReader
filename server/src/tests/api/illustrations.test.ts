import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { newImageKey } from '../../utils/image.js';
import { api, startTestServer } from './helpers.js';
import { createUser, RUN, type TestUser } from './reading-fixtures.js';

// Comunidad: ilustraciones de los usuarios (CU-18 sin reto; RN-22, RN-10, RN-13, RN-15; contrato del bloque 6) contra
// koma_test. El temporal de multer y el almacenamiento local son carpetas propias de este archivo. El tablero es
// global y otros archivos de test publican a la vez: cada test filtra por una etiqueta propia de esta ejecución.
const storageDir = mkdtempSync(path.join(tmpdir(), 'koma-illustrations-storage-'));
const uploadTmp = mkdtempSync(path.join(tmpdir(), 'koma-illustrations-tmp-'));
process.env['STORAGE_DRIVER'] = 'local';
process.env['STORAGE_LOCAL_DIR'] = storageDir;
process.env['TMPDIR'] = uploadTmp;

const srv = startTestServer();
after(async () => {
  await rm(storageDir, { recursive: true, force: true });
  await rm(uploadTmp, { recursive: true, force: true });
});

const db = async () => (await import('../../db/pool.js')).pool;
const tmpFiles = () => readdirSync(uploadTmp);
const storedFiles = () => readdirSync(storageDir);

const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const png = (width = 800, height = 1200) =>
  Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(width), ...be32(height), 8, 6, 0, 0, 0, ...be32(0)]);

interface IllustrationBody {
  id: number;
  title: string;
  description: string | null;
  url: string;
  width: number;
  height: number;
  tags: string[];
  author: { displayName: string };
  publishedAt: string | null;
}
interface OwnBody extends IllustrationBody {
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}
interface Board {
  illustrations: IllustrationBody[];
  tags: { tag: string; count: number }[];
  page: number;
  pageSize: number;
  total: number;
}

let tagCount = 0;
// Etiqueta propia de un test (ya es un slug): aísla el tablero de lo que publican los demás.
const ownTag = () => `t${RUN}-${++tagCount}`;

type Fields = Record<string, string>;
function publish(user: TestUser | null, fields: Fields = { title: 'Una ilustración' }, files: [string, Uint8Array, string][] = [['image', png(), 'dibujo.png']]) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  for (const [name, content, filename] of files) form.append(name, new Blob([content]), filename);
  return fetch(`${srv.baseUrl}/api/illustrations`, { method: 'POST', headers: { Origin: srv.origin, ...(user && { Cookie: user.cookie }) }, body: form });
}

async function published(res: Response): Promise<OwnBody> {
  assert.equal(res.status, 201, await res.clone().text());
  return ((await res.json()) as { illustration: OwnBody }).illustration;
}

async function assertError(res: Response, status: number, code: string, field?: string) {
  assert.equal(res.status, status, await res.clone().text());
  const body = (await res.json()) as { code: string; fields?: Record<string, string> };
  assert.equal(body.code, code);
  if (field) assert.ok(body.fields?.[field], `fields.${field} en ${JSON.stringify(body.fields)}`);
}

async function auditOf(res: Response) {
  const { rows } = await (await db()).query<{ action: string; actor_id: number; entity_type: string; entity_id: string; before: unknown; after: unknown }>(
    'SELECT action, actor_id, entity_type, entity_id, before, after FROM audit_log WHERE request_id = $1',
    [res.headers.get('x-request-id')],
  );
  return rows;
}

interface Seed {
  status?: 'pending' | 'approved' | 'rejected';
  withdrawn?: boolean;
  tags?: string[];
  title?: string;
  publishedAt?: string;
}
// Ilustración escrita directamente en la BD (sin subir nada): para listas, filtros y estados.
async function seed(userId: number, spec: Seed = {}): Promise<number> {
  const pool = await db();
  const status = spec.status ?? 'approved';
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO illustrations (user_id, title, image_key, width, height, status, rejection_reason, published_at, deleted_at)
     VALUES ($1, $2, $3, 600, 900, $4::text, CASE WHEN $4::text = 'rejected' THEN 'Motivo' END,
             CASE WHEN $4::text = 'approved' THEN $5::timestamptz END, CASE WHEN $6::boolean THEN now() END)
     RETURNING id`,
    [userId, spec.title ?? 'Sembrada', newImageKey('webp'), status, spec.publishedAt ?? '2026-11-10T10:00:00Z', spec.withdrawn ?? false],
  );
  const id = rows[0]!.id;
  for (const tag of spec.tags ?? []) await pool.query('INSERT INTO illustration_tags (illustration_id, tag) VALUES ($1, $2)', [id, tag]);
  return id;
}

async function board(query = ''): Promise<Board> {
  const res = await api(srv, 'GET', `/api/illustrations${query}`);
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as Board;
}

async function mine(user: TestUser): Promise<OwnBody[]> {
  const res = await api(srv, 'GET', '/api/me/illustrations', { cookie: user.cookie });
  assert.equal(res.status, 200, await res.clone().text());
  return ((await res.json()) as { illustrations: OwnBody[] }).illustrations;
}

const withdraw = (id: number | string, user: TestUser | null) => api(srv, 'POST', `/api/illustrations/${id}/withdraw`, { ...(user && { cookie: user.cookie }) });

// ── Publicar ──────────────────────────────────────────────────────────────────

test('RN-22: publicar crea la ilustración en pending, con sus medidas y etiquetas normalizadas; 201 con OwnIllustrationDto y auditoría sin la clave de la imagen', async () => {
  const reader = await createUser('reader');
  const res = await publish(reader, { title: '  Dragón de tinta  ', description: 'Línea uno\r\nLínea dos  ', tags: 'Fan Art, TINTA, tinta, ñandú' }, [['image', png(640, 480), 'x.png']]);
  const illustration = await published(res);
  assert.equal(illustration.title, 'Dragón de tinta');
  assert.equal(illustration.description, 'Línea uno\nLínea dos');
  assert.deepEqual(illustration.tags, ['fan-art', 'nandu', 'tinta']);
  assert.equal(illustration.status, 'pending');
  assert.equal(illustration.rejectionReason, null);
  assert.equal(illustration.publishedAt, null);
  assert.deepEqual([illustration.width, illustration.height], [640, 480]);
  assert.equal(illustration.author.displayName, `reader ${RUN}`);
  assert.ok(!Number.isNaN(Date.parse(illustration.createdAt)));
  // Imagen con URL firmada, que se puede pedir.
  assert.match(illustration.url, /^\/files\/[0-9a-f-]{36}\.png\?/);
  assert.equal((await fetch(`${srv.baseUrl}${illustration.url}`)).status, 200);

  const { rows } = await (await db()).query<{ user_id: number; status: string; image_key: string }>('SELECT user_id, status, image_key FROM illustrations WHERE id = $1', [illustration.id]);
  assert.equal(rows[0]!.user_id, reader.id);
  assert.equal(rows[0]!.status, 'pending');

  const audit = await auditOf(res);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]!.action, 'illustration.create');
  assert.equal(audit[0]!.actor_id, reader.id);
  assert.equal(audit[0]!.entity_type, 'illustrations');
  assert.equal(audit[0]!.entity_id, String(illustration.id));
  assert.deepEqual(audit[0]!.after, { title: 'Dragón de tinta', tags: ['fan-art', 'nandu', 'tinta'] });
  assert.ok(!JSON.stringify(audit[0]).includes(rows[0]!.image_key));
  assert.deepEqual(tmpFiles(), []);
});

test('RN-22: la descripción y las etiquetas son opcionales (null y ninguna)', async () => {
  const reader = await createUser('reader');
  const illustration = await published(await publish(reader, { title: 'Solo título' }));
  assert.equal(illustration.description, null);
  assert.deepEqual(illustration.tags, []);
  const empty = await published(await publish(reader, { title: 'Vacíos', description: '   ', tags: ' , ' }));
  assert.equal(empty.description, null);
  assert.deepEqual(empty.tags, []);
});

test('RN-22: publican el lector, el premium y el autor; el admin recibe 403 y sin sesión 401, sin escribir nada en disco', async () => {
  for (const kind of ['reader', 'premium', 'author'] as const) {
    await published(await publish(await createUser(kind)));
  }
  const before = storedFiles().length;
  await assertError(await publish(await createUser('admin')), 403, 'FORBIDDEN');
  await assertError(await publish(null), 401, 'UNAUTHENTICATED');
  assert.equal(storedFiles().length, before);
  assert.deepEqual(tmpFiles(), []);
});

test('RN-22: título de 1 a 100, descripción de 0 a 500 y etiquetas de 0 a 5 (de 2 a 30 caracteres): si no, 400 en su campo y no se guarda nada', async () => {
  const reader = await createUser('reader');
  const before = storedFiles().length;
  await assertError(await publish(reader, {}), 400, 'VALIDATION_ERROR', 'title');
  await assertError(await publish(reader, { title: '   ' }), 400, 'VALIDATION_ERROR', 'title');
  await assertError(await publish(reader, { title: 'a'.repeat(101) }), 400, 'VALIDATION_ERROR', 'title');
  await assertError(await publish(reader, { title: 'Con\u0007control' }), 400, 'VALIDATION_ERROR', 'title');
  await assertError(await publish(reader, { title: 'Vale', description: 'a'.repeat(501) }), 400, 'VALIDATION_ERROR', 'description');
  await assertError(await publish(reader, { title: 'Vale', tags: 'uno,dos,tres,cuatro,cinco,seis' }), 400, 'VALIDATION_ERROR', 'tags');
  await assertError(await publish(reader, { title: 'Vale', tags: 'a' }), 400, 'VALIDATION_ERROR', 'tags');
  await assertError(await publish(reader, { title: 'Vale', tags: 'a'.repeat(31) }), 400, 'VALIDATION_ERROR', 'tags');
  assert.equal(storedFiles().length, before);
  assert.deepEqual(await mine(reader), []);
  assert.deepEqual(tmpFiles(), []);
  // Los límites exactos valen.
  await published(await publish(reader, { title: 'a'.repeat(100), description: 'ñ'.repeat(500), tags: `ab,${'a'.repeat(30)},tres,cuatro,cinco` }));
});

test('RN-10: la imagen se comprueba por su firma (415), pesa 5 MB como mucho (413) y es obligatoria y única (400 en fields.image)', async () => {
  const reader = await createUser('reader');
  const before = storedFiles().length;
  const notImage = new TextEncoder().encode('<html>no soy una imagen</html>');
  await assertError(await publish(reader, { title: 'Vale' }, [['image', notImage, 'falsa.png']]), 415, 'UNSUPPORTED_FILE');
  const big = new Uint8Array(5 * 1024 * 1024 + 1);
  big.set(png());
  await assertError(await publish(reader, { title: 'Vale' }, [['image', big, 'grande.png']]), 413, 'FILE_TOO_LARGE');
  await assertError(await publish(reader, { title: 'Vale' }, []), 400, 'VALIDATION_ERROR', 'image');
  await assertError(await publish(reader, { title: 'Vale' }, [['image', png(), 'a.png'], ['image', png(), 'b.png']]), 400, 'VALIDATION_ERROR', 'image');
  await assertError(await publish(reader, { title: 'Vale' }, [['foto', png(), 'a.png']]), 400, 'VALIDATION_ERROR', 'image');
  await assertError(await api(srv, 'POST', '/api/illustrations', { body: { title: 'Vale' }, cookie: reader.cookie }), 400, 'VALIDATION_ERROR', 'image');
  assert.equal(storedFiles().length, before);
  assert.deepEqual(await mine(reader), []);
  assert.deepEqual(tmpFiles(), []);
});

test('RN-22: como mucho 5 pendientes por usuario: la sexta da 409 sin guardar la imagen; las aprobadas, rechazadas y retiradas no cuentan', async () => {
  const reader = await createUser('reader');
  await seed(reader.id, { status: 'approved' });
  await seed(reader.id, { status: 'rejected' });
  await seed(reader.id, { status: 'pending', withdrawn: true });
  for (let i = 0; i < 4; i++) await seed(reader.id, { status: 'pending' });
  const fifth = await published(await publish(reader, { title: 'Quinta' }));
  const before = storedFiles().length;
  await assertError(await publish(reader, { title: 'Sexta' }), 409, 'CONFLICT');
  assert.equal(storedFiles().length, before);
  assert.deepEqual(tmpFiles(), []);
  // Al retirar una pendiente vuelve a haber hueco.
  assert.equal((await withdraw(fifth.id, reader)).status, 204);
  await published(await publish(reader, { title: 'Otra vez la quinta' }));
});

// ── Tablero público ───────────────────────────────────────────────────────────

test('RN-22: el tablero solo trae las aprobadas y no retiradas, de la más reciente a la más antigua, con URL firmada, medidas y autor; sin sesión', async () => {
  const author = await createUser('author');
  const tag = ownTag();
  const old = await seed(author.id, { tags: [tag], title: 'Antigua', publishedAt: '2026-11-01T10:00:00Z' });
  const recent = await seed(author.id, { tags: [tag, 'boceto'], title: 'Reciente', publishedAt: '2026-11-05T10:00:00Z' });
  await seed(author.id, { tags: [tag], status: 'pending' });
  await seed(author.id, { tags: [tag], status: 'rejected' });
  await seed(author.id, { tags: [tag], status: 'approved', withdrawn: true });

  const result = await board(`?tag=${tag}`);
  assert.deepEqual(result.illustrations.map((item) => item.id), [recent, old]);
  assert.equal(result.total, 2);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 24);
  const first = result.illustrations[0]!;
  assert.deepEqual(Object.keys(first).sort(), ['author', 'description', 'height', 'id', 'publishedAt', 'tags', 'title', 'url', 'width']);
  assert.equal(first.title, 'Reciente');
  assert.equal(first.description, null);
  assert.deepEqual(first.tags, ['boceto', tag].sort());
  assert.deepEqual(first.author, { displayName: `author ${RUN}` });
  assert.equal(first.publishedAt, '2026-11-05T10:00:00.000Z');
  assert.deepEqual([first.width, first.height], [600, 900]);
  assert.match(first.url, /^\/files\/[0-9a-f-]{36}\.webp\?/);
  // Sin filtro también salen (el tablero es global).
  const all = await board();
  assert.ok(all.total >= 2);
  assert.ok(all.illustrations.length <= 24);
});

test('RN-22: las etiquetas del tablero cuentan solo las ilustraciones públicas, de la más usada a la menos', async () => {
  const reader = await createUser('reader');
  const [popular, rare, hidden] = [ownTag(), ownTag(), ownTag()];
  await seed(reader.id, { tags: [popular, rare] });
  await seed(reader.id, { tags: [popular] });
  await seed(reader.id, { tags: [popular, hidden], status: 'pending' });
  await seed(reader.id, { tags: [hidden], withdrawn: true });
  const { tags } = await board();
  assert.ok(tags.length <= 30);
  // Las más usadas van primero: entre las de este test, `popular` antes que `rare`; `hidden` no existe para el público.
  const { rows } = await (await db()).query<{ tag: string; count: number }>(
    `SELECT t.tag, count(*)::int AS count FROM illustration_tags t JOIN illustrations i ON i.id = t.illustration_id
     WHERE i.status = 'approved' AND i.deleted_at IS NULL AND t.tag = ANY($1::text[]) GROUP BY t.tag`,
    [[popular, rare, hidden]],
  );
  assert.deepEqual(rows.sort((a, b) => b.count - a.count), [{ tag: popular, count: 2 }, { tag: rare, count: 1 }]);
  for (let i = 1; i < tags.length; i++) assert.ok(tags[i - 1]!.count >= tags[i]!.count, 'ordenadas por uso');
  assert.ok(!tags.some((entry) => entry.tag === hidden));
});

test('RN-22: el tablero se pagina de 24 en 24 y rechaza una etiqueta o una página no válidas con 400', async () => {
  const reader = await createUser('reader');
  const tag = ownTag();
  for (let i = 0; i < 25; i++) await seed(reader.id, { tags: [tag], publishedAt: `2026-11-01T10:00:${String(i).padStart(2, '0')}Z` });
  const first = await board(`?tag=${tag}`);
  assert.equal(first.illustrations.length, 24);
  assert.equal(first.total, 25);
  const second = await board(`?tag=${tag}&page=2`);
  assert.equal(second.illustrations.length, 1);
  assert.equal(second.page, 2);
  assert.deepEqual((await board(`?tag=${tag}&page=3`)).illustrations, []);
  for (const query of ['?tag=Con%20Espacios', '?tag=a', `?tag=${'a'.repeat(31)}`, '?tag=%00', '?tag=uno&tag=dos', '?page=0', '?page=abc', '?page=1.5']) {
    await assertError(await api(srv, 'GET', `/api/illustrations${query}`), 400, 'VALIDATION_ERROR');
  }
});

test('RN-15: la ilustración aprobada de una cuenta suspendida sigue en el tablero', async () => {
  const reader = await createUser('reader');
  const tag = ownTag();
  const id = await seed(reader.id, { tags: [tag] });
  await (await db()).query("UPDATE users SET status = 'suspended', token_version = token_version + 1 WHERE id = $1", [reader.id]);
  assert.deepEqual((await board(`?tag=${tag}`)).illustrations.map((item) => item.id), [id]);
});

// ── Mis ilustraciones ─────────────────────────────────────────────────────────

test('RN-22: «Mis ilustraciones» trae las propias en cualquier estado salvo las retiradas, de la más reciente a la más antigua, con el motivo del rechazo; sin sesión, 401', async () => {
  const reader = await createUser('reader');
  const other = await createUser('reader');
  const pending = await seed(reader.id, { status: 'pending' });
  const approved = await seed(reader.id, { status: 'approved' });
  const rejected = await seed(reader.id, { status: 'rejected' });
  await seed(reader.id, { status: 'approved', withdrawn: true });
  await seed(other.id, { status: 'approved' });

  const list = await mine(reader);
  assert.deepEqual(list.map((item) => item.id), [rejected, approved, pending]);
  assert.deepEqual(list.map((item) => item.status), ['rejected', 'approved', 'pending']);
  assert.deepEqual(list.map((item) => item.rejectionReason), ['Motivo', null, null]);
  assert.equal(list[1]!.publishedAt, '2026-11-10T10:00:00.000Z');
  assert.equal(list[2]!.publishedAt, null);
  const res = await api(srv, 'GET', '/api/me/illustrations', { cookie: reader.cookie });
  const body = (await res.json()) as { page: number; pageSize: number; total: number };
  assert.deepEqual([body.page, body.pageSize, body.total], [1, 24, 3]);
  await assertError(await api(srv, 'GET', '/api/me/illustrations'), 401, 'UNAUTHENTICATED');
  await assertError(await api(srv, 'GET', '/api/me/illustrations?page=0', { cookie: reader.cookie }), 400, 'VALIDATION_ERROR');
});

// ── Retirar ───────────────────────────────────────────────────────────────────

test('RN-22: retira la ilustración su dueño (204, borrado lógico y auditoría); deja de salir en el tablero y en «Mis ilustraciones», y una retirada no vuelve (409)', async () => {
  const reader = await createUser('reader');
  const tag = ownTag();
  const id = await seed(reader.id, { tags: [tag] });
  const res = await withdraw(id, reader);
  assert.equal(res.status, 204);
  const { rows } = await (await db()).query<{ deleted_at: Date | null; status: string }>('SELECT deleted_at, status FROM illustrations WHERE id = $1', [id]);
  assert.ok(rows[0]!.deleted_at);
  assert.equal(rows[0]!.status, 'approved');
  const audit = await auditOf(res);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]!.action, 'illustration.withdraw');
  assert.equal(audit[0]!.actor_id, reader.id);
  assert.equal(audit[0]!.entity_id, String(id));
  assert.deepEqual(audit[0]!.before, { deletedAt: null });
  assert.deepEqual(audit[0]!.after, { deletedAt: rows[0]!.deleted_at!.toISOString() });
  assert.deepEqual((await board(`?tag=${tag}`)).illustrations, []);
  assert.deepEqual(await mine(reader), []);
  await assertError(await withdraw(id, reader), 409, 'CONFLICT');
});

test('RN-22: retirar exige sesión (401) y ser el dueño o el admin (403); una que no existe es 404; el admin retira la de cualquiera, en cualquier estado', async () => {
  const owner = await createUser('reader');
  const other = await createUser('author');
  const admin = await createUser('admin');
  const approved = await seed(owner.id);
  const pending = await seed(owner.id, { status: 'pending' });
  await assertError(await withdraw(approved, null), 401, 'UNAUTHENTICATED');
  await assertError(await withdraw(approved, other), 403, 'FORBIDDEN');
  await assertError(await withdraw(2_000_000_000, owner), 404, 'NOT_FOUND');
  await assertError(await withdraw('abc', owner), 404, 'NOT_FOUND');
  await assertError(await withdraw('0', owner), 404, 'NOT_FOUND');
  const res = await withdraw(approved, admin);
  assert.equal(res.status, 204);
  assert.equal((await auditOf(res))[0]!.actor_id, admin.id);
  assert.equal((await withdraw(pending, admin)).status, 204);
  assert.deepEqual(await mine(owner), []);
});
