import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createComic, createUser, markRead, type TestComic, type TestUser } from './reading-fixtures.js';

// Comentarios por viñeta (CU-05, CU-13; RN-11, RN-13; contrato del bloque 3) contra koma_test.
const storageDir = mkdtempSync(path.join(tmpdir(), 'koma-comments-'));
process.env['STORAGE_DRIVER'] = 'local';
process.env['STORAGE_LOCAL_DIR'] = storageDir;

const srv = startTestServer();
after(() => rm(storageDir, { recursive: true, force: true }));

const db = async () => (await import('../../db/pool.js')).pool;

interface CommentBody {
  id: number;
  body: string;
  authorName: string;
  createdAt: string;
  mine: boolean;
}
interface PageBody {
  comments: CommentBody[];
  page: number;
  pageSize: number;
  total: number;
}

let comic: TestComic;
let pending: TestComic;
let withdrawn: TestComic;
let author: TestUser;

before(async () => {
  author = await createUser('author');
  comic = await createComic({
    name: 'comentarios',
    authorId: author.id,
    chapters: [{ number: 1, panels: 3 }, { number: 2 }, { number: 5 }, { number: 6, withdrawn: true }, { number: 7, status: 'pending' }],
  });
  pending = await createComic({ name: 'comentarios-pendiente', status: 'pending', chapters: [{ number: 1 }] });
  withdrawn = await createComic({ name: 'comentarios-retirada', withdrawn: true, chapters: [{ number: 1 }] });
});

const url = (slug: string, number: number | string, position: number | string) => `/api/comics/${slug}/chapters/${number}/panels/${position}/comments`;
const post = (user: TestUser | null, body: unknown, number: number | string = 1, position: number | string = 1, slug = comic.slug) =>
  api(srv, 'POST', url(slug, number, position), { body: { body }, ...(user && { cookie: user.cookie }) });
const list = (user: TestUser | null, query = '', number = 1, position = 1) =>
  api(srv, 'GET', `${url(comic.slug, number, position)}${query}`, user ? { cookie: user.cookie } : {});

async function created(res: Response): Promise<CommentBody> {
  assert.equal(res.status, 201);
  return ((await res.json()) as { comment: CommentBody }).comment;
}

test('RN-11: un registrado publica en una viñeta de los caps. 1–2; el texto se guarda recortado y con \\n', async () => {
  const reader = await createUser('reader');
  const comment = await created(await post(reader, '  ¡Qué viñeta!\r\nMe encanta.  ', 1, 2));
  assert.equal(comment.body, '¡Qué viñeta!\nMe encanta.');
  assert.equal(comment.mine, true);
  assert.equal(comment.authorName, `reader ${comic.slug.slice(1, 7)}`);
  assert.ok(!Number.isNaN(Date.parse(comment.createdAt)));
  assert.deepEqual(Object.keys(comment).sort(), ['authorName', 'body', 'createdAt', 'id', 'mine']);
});

test('RN-11: de 1 a 500 caracteres contados en puntos de código; el HTML se guarda tal cual (el cliente usa textContent)', async () => {
  const reader = await createUser('reader');
  for (const body of ['', '   ', 'x'.repeat(501), 'a\u0000b', 42]) {
    const res = await post(reader, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    const error = (await res.json()) as { code: string; fields: Record<string, string> };
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.ok(error.fields['body']);
  }
  assert.equal((await created(await post(reader, '😀'.repeat(500)))).body.length, 1000);
  assert.equal((await created(await post(reader, '<img src=x onerror=alert(1)>'))).body, '<img src=x onerror=alert(1)>');
});

test('RN-11: el invitado no comenta (401); quien no puede leer el capítulo sin gastar saldo, tampoco (403)', async () => {
  assert.equal((await post(null, 'Hola')).status, 401);
  const reader = await createUser('reader');
  const forbidden = await post(reader, 'Sin leerlo', 5);
  assert.equal(forbidden.status, 403);
  assert.equal(((await forbidden.json()) as { code: string }).code, 'FORBIDDEN');

  await markRead(reader.id, comic.chapterIds.get('5')!);
  await created(await post(reader, 'Ya lo leí', 5));
  await created(await post(await createUser('premium'), 'Premium', 5));
  await created(await post(await createUser('admin'), 'Admin', 5));
  await created(await post(author, 'Mi propia obra', 5));
});

test('RN-11: solo se comenta en viñetas de capítulos públicos (404 y 410, como la lectura)', async () => {
  // Cada intento validado cuenta para el límite de 5 / min (RN-13): un usuario por cada caso.
  for (const [number, position, slug] of [
    [1, 4, comic.slug], // la viñeta no existe
    [1, 0, comic.slug],
    [1, '01', comic.slug],
    [1, 'abc', comic.slug],
    [9, 1, comic.slug], // el capítulo no existe
    [7, 1, comic.slug], // pendiente: nunca fue público
    [1, 1, pending.slug], // obra pendiente
  ] as const) {
    assert.equal((await post(await createUser('reader'), 'x', number, position, slug)).status, 404, `${slug} ${number} ${position}`);
    assert.equal((await api(srv, 'GET', url(slug, number, position))).status, 404, `GET ${slug} ${number} ${position}`);
  }
  const reader = await createUser('reader');
  assert.equal((await post(reader, 'x', 6)).status, 410); // capítulo retirado
  assert.equal((await post(reader, 'x', 1, 1, withdrawn.slug)).status, 410); // obra retirada (RN-06)
  assert.equal((await api(srv, 'GET', url(withdrawn.slug, 1, 1))).status, 410);
});

test('RN-11: la lista es pública, cronológica y sin ocultos ni eliminados; `mine` solo para quien lo escribió', async () => {
  const [ana, bea] = [await createUser('reader'), await createUser('reader')];
  const first = await created(await post(ana, 'Primero', 1, 3));
  const second = await created(await post(bea, 'Segundo', 1, 3));
  const hidden = await created(await post(bea, 'Oculto por el admin', 1, 3));
  const removed = await created(await post(ana, 'Borrado por su autora', 1, 3));
  await (await db()).query('UPDATE comments SET hidden_at = now() WHERE id = $1', [hidden.id]);
  assert.equal((await api(srv, 'DELETE', `/api/comments/${removed.id}`, { cookie: ana.cookie })).status, 204);

  const guest = (await (await list(null, '', 1, 3)).json()) as PageBody;
  assert.deepEqual(guest.comments.map((c) => c.body), ['Primero', 'Segundo']);
  assert.deepEqual(guest.comments.map((c) => c.mine), [false, false]);
  assert.deepEqual([guest.page, guest.pageSize, guest.total], [1, 50, 2]);

  const asAna = (await (await list(ana, '', 1, 3)).json()) as PageBody;
  assert.deepEqual(asAna.comments.map((c) => [c.id, c.mine]), [[first.id, true], [second.id, false]]);
  // Un oculto no lo ve nadie, tampoco su autora.
  const asBea = (await (await list(bea, '', 1, 3)).json()) as PageBody;
  assert.ok(!asBea.comments.some((c) => c.id === hidden.id));
});

test('RN-11: 50 comentarios por página; una página fuera de rango llega vacía y `page` no válida da 400', async () => {
  const pool = await db();
  const other = await createComic({ name: 'comentarios-paginas', chapters: [{ number: 1, panels: 1 }] });
  const reader = await createUser('reader');
  const { rows } = await pool.query<{ id: number }>('SELECT id FROM panels WHERE chapter_id = $1', [other.chapterIds.get('1')]);
  await pool.query(
    `INSERT INTO comments (panel_id, user_id, body, created_at)
     SELECT $1, $2, 'Comentario ' || n, '2026-11-01T00:00:00Z'::timestamptz + make_interval(mins => n)
     FROM generate_series(1, 51) AS n`,
    [rows[0]!.id, reader.id],
  );
  const page = async (query: string) => (await api(srv, 'GET', `${url(other.slug, 1, 1)}${query}`)).json() as Promise<PageBody>;
  const one = await page('');
  assert.equal(one.comments.length, 50);
  assert.equal(one.comments[0]!.body, 'Comentario 1');
  assert.equal(one.total, 51);
  assert.deepEqual((await page('?page=2')).comments.map((c) => c.body), ['Comentario 51']);
  assert.deepEqual((await page('?page=3')).comments, []);
  for (const bad of ['?page=0', '?page=x', '?page=1.5']) assert.equal((await api(srv, 'GET', `${url(other.slug, 1, 1)}${bad}`)).status, 400, bad);
});

test('RN-11: borrar el propio: 204 y auditoría sin el texto; otra vez, 409; el de otro, 403; uno oculto o inexistente, 404', async () => {
  const [ana, bea] = [await createUser('reader'), await createUser('reader')];
  const own = await created(await post(ana, 'Me arrepiento'));
  const others = await created(await post(bea, 'De Bea'));
  const hidden = await created(await post(ana, 'Oculto'));
  await (await db()).query('UPDATE comments SET hidden_at = now() WHERE id = $1', [hidden.id]);
  const del = (id: number | string, user: TestUser | null) => api(srv, 'DELETE', `/api/comments/${id}`, user ? { cookie: user.cookie } : {});

  assert.equal((await del(own.id, null)).status, 401);
  const forbidden = await del(others.id, ana);
  assert.equal(forbidden.status, 403);
  assert.equal(((await forbidden.json()) as { code: string }).code, 'FORBIDDEN');
  assert.equal((await del(hidden.id, ana)).status, 404); // D15
  assert.equal((await del(2_000_000_000, ana)).status, 404);
  assert.equal((await del('abc', ana)).status, 404);

  assert.equal((await del(own.id, ana)).status, 204);
  const again = await del(own.id, ana);
  assert.equal(again.status, 409);
  assert.equal(((await again.json()) as { code: string }).code, 'CONFLICT');

  const { rows } = await (await db()).query<{ actor_id: number; entity_type: string; before: object; after: { deletedAt: string } }>(
    `SELECT actor_id, entity_type, before, after FROM audit_log WHERE action = 'comment.delete_own' AND entity_id = $1`,
    [String(own.id)],
  );
  assert.equal(rows.length, 1); // el 409 no deja otra entrada
  assert.equal(rows[0]!.actor_id, ana.id);
  assert.equal(rows[0]!.entity_type, 'comments');
  assert.deepEqual(rows[0]!.before, { deletedAt: null });
  assert.deepEqual(Object.keys(rows[0]!.after), ['deletedAt']);
});

test('RN-06: borrar el propio de un capítulo o una obra retirados da 410, sin cambios ni auditoría; el ajeno sigue en 403', async () => {
  const later = await createComic({ name: 'comentarios-retirar-despues', chapters: [{ number: 1 }, { number: 2 }] });
  const [ana, bea] = [await createUser('reader'), await createUser('reader')];
  const inChapter = await created(await post(ana, 'En el capítulo 2', 2, 1, later.slug));
  const inComic = await created(await post(ana, 'En el capítulo 1', 1, 1, later.slug));
  const others = await created(await post(bea, 'De Bea', 1, 1, later.slug));
  const del = (id: number, user: TestUser) => api(srv, 'DELETE', `/api/comments/${id}`, { cookie: user.cookie });
  const pg = await db();

  await pg.query('UPDATE chapters SET deleted_at = now() WHERE comic_id = $1 AND number = 2', [later.id]);
  const gone = await del(inChapter.id, ana);
  assert.equal(gone.status, 410);
  assert.equal(((await gone.json()) as { code: string }).code, 'GONE');

  await pg.query('UPDATE comics SET deleted_at = now() WHERE id = $1', [later.id]);
  assert.equal((await del(inComic.id, ana)).status, 410);
  assert.equal((await del(others.id, ana)).status, 403); // ajeno: no revela que se retiró

  const ids = [inChapter.id, inComic.id, others.id];
  const { rows } = await pg.query<{ deleted: number }>('SELECT count(*)::int AS deleted FROM comments WHERE id = ANY($1) AND deleted_at IS NOT NULL', [ids]);
  assert.equal(rows[0]!.deleted, 0, 'ninguno se marca como eliminado');
  const audit = await pg.query(`SELECT 1 FROM audit_log WHERE action = 'comment.delete_own' AND entity_id = ANY($1)`, [ids.map(String)]);
  assert.equal(audit.rowCount, 0, 'sin auditoría');
});

test('RN-13: como mucho 5 comentarios por minuto y usuario; un 400 no cuenta', async () => {
  const reader = await createUser('reader');
  assert.equal((await post(reader, '')).status, 400);
  for (let i = 1; i <= 5; i++) await created(await post(reader, `Comentario ${i}`));
  const limited = await post(reader, 'El sexto');
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  const error = (await limited.json()) as { code: string; retryAt: string };
  assert.equal(error.code, 'RATE_LIMITED');
  assert.ok(Date.parse(error.retryAt) > Date.now());
  await created(await post(await createUser('reader'), 'Otro usuario, otro contador'));
});

test('Seguridad: publicar y borrar comentarios exigen el Origin propio (CSRF)', async () => {
  const reader = await createUser('reader');
  const comment = await created(await post(reader, 'Con Origin'));
  const noOrigin = { 'Content-Type': 'application/json', Cookie: reader.cookie };
  const postRes = await fetch(`${srv.baseUrl}${url(comic.slug, 1, 1)}`, { method: 'POST', headers: noOrigin, body: JSON.stringify({ body: 'x' }) });
  assert.equal(postRes.status, 403);
  assert.equal(((await postRes.json()) as { code: string }).code, 'CSRF');
  const delRes = await fetch(`${srv.baseUrl}/api/comments/${comment.id}`, { method: 'DELETE', headers: { Cookie: reader.cookie, Origin: 'https://evil.example' } });
  assert.equal(delRes.status, 403);
});

test('RN-11: la lectura trae el contador de cada viñeta, sin ocultos ni eliminados', async () => {
  const other = await createComic({ name: 'comentarios-contador', chapters: [{ number: 1, panels: 3 }] });
  const [ana, bea] = [await createUser('reader'), await createUser('reader')];
  await created(await post(ana, 'Uno', 1, 1, other.slug));
  await created(await post(bea, 'Dos', 1, 1, other.slug));
  const hidden = await created(await post(ana, 'Oculto', 1, 3, other.slug));
  const removed = await created(await post(bea, 'Borrado', 1, 3, other.slug));
  await (await db()).query('UPDATE comments SET hidden_at = now() WHERE id = $1', [hidden.id]);
  await api(srv, 'DELETE', `/api/comments/${removed.id}`, { cookie: bea.cookie });

  const res = await api(srv, 'POST', `/api/comics/${other.slug}/chapters/1/read`);
  assert.equal(res.status, 200);
  const { reading } = (await res.json()) as { reading: { panels: { position: number; comments: number }[] } };
  assert.deepEqual(reading.panels.map((p) => [p.position, p.comments]), [[1, 2], [2, 0], [3, 0]]);
});
