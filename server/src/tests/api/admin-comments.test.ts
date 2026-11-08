import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createComic, createUser, RUN } from './reading-fixtures.js';

// Moderación de comentarios (CU-33; RN-11; contrato del bloque 4) contra koma_test.
const srv = startTestServer();
const db = async () => (await import('../../db/pool.js')).pool;

interface AdminComment {
  id: number;
  body: string;
  author: { id: number; displayName: string };
  hiddenAt: string | null;
  comic: { slug: string; title: string };
  chapterNumber: number;
  panelPosition: number;
}
interface AdminCommentsPage {
  comments: AdminComment[];
  page: number;
  pageSize: number;
  total: number;
}

const codeOf = async (res: Response) => `${res.status} ${((await res.json()) as { code: string }).code}`;
let works = 0;

// Obra aprobada con un capítulo de 2 viñetas y un comentario por cada texto, en la viñeta 2.
async function commentedWork(bodies: string[]) {
  const reader = await createUser('reader');
  const comic = await createComic({ name: `mod-${++works}`, chapters: [{ number: 1 }] });
  const chapterId = comic.chapterIds.get('1')!;
  const pool = await db();
  const { rows } = await pool.query<{ id: number }>('SELECT id FROM panels WHERE chapter_id = $1 AND position = 2', [chapterId]);
  const ids: number[] = [];
  for (const body of bodies) {
    const inserted = await pool.query<{ id: number }>('INSERT INTO comments (panel_id, user_id, body) VALUES ($1, $2, $3) RETURNING id', [rows[0]!.id, reader.id, body]);
    ids.push(inserted.rows[0]!.id);
  }
  return { reader, comic, chapterId, ids };
}

const list = async (cookie: string, query = '') => (await (await api(srv, 'GET', `/api/admin/comments${query}`, { cookie })).json()) as AdminCommentsPage;

test('RN-11: el admin ve los comentarios del más reciente al más antiguo, con su ubicación, y busca en el texto y en el autor', async () => {
  const admin = await createUser('admin');
  const { reader, comic, ids } = await commentedWork([`Primero ${RUN}`, `Segundo ${RUN} 100%_raro`]);
  const page = await list(admin.cookie, `?q=${encodeURIComponent(RUN)}`);
  const mine = page.comments.filter((c) => ids.includes(c.id));
  assert.deepEqual(mine.map((c) => c.id), [ids[1], ids[0]]);
  assert.deepEqual(
    { author: mine[0]!.author, comic: mine[0]!.comic, chapterNumber: mine[0]!.chapterNumber, panelPosition: mine[0]!.panelPosition, hiddenAt: mine[0]!.hiddenAt },
    { author: { id: reader.id, displayName: `reader ${RUN}` }, comic: { slug: comic.slug, title: `Obra mod-${works}` }, chapterNumber: 1, panelPosition: 2, hiddenAt: null },
  );
  assert.equal(page.pageSize, 50);
  // % y _ se buscan tal cual (ILIKE escapado).
  const literal = await list(admin.cookie, `?q=${encodeURIComponent('100%_raro')}`);
  assert.deepEqual(literal.comments.filter((c) => ids.includes(c.id)).map((c) => c.id), [ids[1]]);
  const byAuthor = await list(admin.cookie, `?q=${encodeURIComponent(`reader ${RUN}`)}`);
  assert.ok(byAuthor.comments.some((c) => c.id === ids[0]));
});

test('RN-11: ocultar quita el comentario de la lista pública y del contador, también para su autor, y audita comment.hide', async () => {
  const admin = await createUser('admin');
  const { reader, comic, ids } = await commentedWork([`Ofensivo ${RUN}`]);
  const res = await api(srv, 'POST', `/api/admin/comments/${ids[0]}/hide`, { cookie: admin.cookie });
  assert.equal(res.status, 204);
  const { rows } = await (await db()).query<{ action: string; actor_id: number; before: unknown; after: { hiddenAt: string } }>(
    'SELECT action, actor_id, before, after FROM audit_log WHERE request_id = $1',
    [res.headers.get('x-request-id')],
  );
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0]!.action, rows[0]!.actor_id, rows[0]!.before], ['comment.hide', admin.id, { hiddenAt: null }]);
  assert.ok(!JSON.stringify(rows[0]).includes('Ofensivo'), 'sin el texto');

  const publicList = (await (await api(srv, 'GET', `/api/comics/${comic.slug}/chapters/1/panels/2/comments`, { cookie: reader.cookie })).json()) as { total: number };
  assert.equal(publicList.total, 0);
  const reading = (await (await api(srv, 'POST', `/api/comics/${comic.slug}/chapters/1/read`, { cookie: reader.cookie })).json()) as {
    reading: { panels: { position: number; comments: number }[] };
  };
  assert.equal(reading.reading.panels.find((p) => p.position === 2)?.comments, 0);
  // El admin lo sigue viendo, como oculto, y lo puede filtrar.
  const hidden = await list(admin.cookie, `?status=hidden&q=${encodeURIComponent(`Ofensivo ${RUN}`)}`);
  assert.equal(hidden.comments[0]?.id, ids[0]);
  assert.ok(hidden.comments[0]?.hiddenAt);
  const visible = await list(admin.cookie, `?status=visible&q=${encodeURIComponent(`Ofensivo ${RUN}`)}`);
  assert.equal(visible.total, 0);
  assert.equal(await codeOf(await api(srv, 'POST', `/api/admin/comments/${ids[0]}/hide`, { cookie: admin.cookie })), '409 CONFLICT');
});

test('RN-11: eliminar (también uno oculto) lo saca de la lista del admin y audita comment.delete; repetirlo da 409', async () => {
  const admin = await createUser('admin');
  const { ids } = await commentedWork([`Spam ${RUN}`, `Otro spam ${RUN}`]);
  await api(srv, 'POST', `/api/admin/comments/${ids[1]}/hide`, { cookie: admin.cookie });
  for (const id of ids) {
    const res = await api(srv, 'DELETE', `/api/admin/comments/${id}`, { cookie: admin.cookie });
    assert.equal(res.status, 204);
    const { rows } = await (await db()).query<{ action: string; before: unknown }>('SELECT action, before FROM audit_log WHERE request_id = $1', [
      res.headers.get('x-request-id'),
    ]);
    assert.deepEqual(rows, [{ action: 'comment.delete', before: { deletedAt: null } }]);
  }
  const page = await list(admin.cookie, `?q=${encodeURIComponent(`spam ${RUN}`)}`);
  assert.equal(page.comments.filter((c) => ids.includes(c.id)).length, 0);
  assert.equal(await codeOf(await api(srv, 'DELETE', `/api/admin/comments/${ids[0]}`, { cookie: admin.cookie })), '409 CONFLICT');
  assert.equal(await codeOf(await api(srv, 'POST', `/api/admin/comments/${ids[0]}/hide`, { cookie: admin.cookie })), '409 CONFLICT');
});

test('RN-06: un comentario de una obra o un capítulo retirados da 410 y no sale en la lista; uno inexistente, 404', async () => {
  const admin = await createUser('admin');
  const { comic, chapterId, ids } = await commentedWork([`Retirado ${RUN} a`, `Retirado ${RUN} b`]);
  await (await db()).query('UPDATE chapters SET deleted_at = now() WHERE id = $1', [chapterId]);
  assert.equal(await codeOf(await api(srv, 'POST', `/api/admin/comments/${ids[0]}/hide`, { cookie: admin.cookie })), '410 GONE');
  await (await db()).query('UPDATE comics SET deleted_at = now() WHERE id = $1', [comic.id]);
  assert.equal(await codeOf(await api(srv, 'DELETE', `/api/admin/comments/${ids[1]}`, { cookie: admin.cookie })), '410 GONE');
  assert.equal((await list(admin.cookie, `?q=${encodeURIComponent(`Retirado ${RUN}`)}`)).total, 0);
  assert.equal(await codeOf(await api(srv, 'POST', '/api/admin/comments/2147483647/hide', { cookie: admin.cookie })), '404 NOT_FOUND');
  assert.equal(await codeOf(await api(srv, 'DELETE', '/api/admin/comments/abc', { cookie: admin.cookie })), '404 NOT_FOUND');
});

test('Seguridad: moderar exige rol admin; filtros fuera de la lista o una búsqueda larga dan 400', async () => {
  const reader = await createUser('reader');
  const { ids } = await commentedWork([`Ajeno ${RUN}`]);
  assert.equal(await codeOf(await api(srv, 'POST', `/api/admin/comments/${ids[0]}/hide`, { cookie: reader.cookie })), '403 FORBIDDEN');
  assert.equal(await codeOf(await api(srv, 'DELETE', `/api/admin/comments/${ids[0]}`)), '401 UNAUTHENTICATED');
  const admin = await createUser('admin');
  for (const query of ['?status=deleted', `?q=${'x'.repeat(101)}`, '?page=0', '?q=a&q=b']) {
    assert.equal(await codeOf(await api(srv, 'GET', `/api/admin/comments${query}`, { cookie: admin.cookie })), '400 VALIDATION_ERROR', query);
  }
});
