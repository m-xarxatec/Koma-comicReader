import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createComic, createUser, RUN } from './reading-fixtures.js';

// Aprobación de contenido (CU-32; RN-05, RN-09, RN-17; contrato del bloque 4) contra koma_test.
const srv = startTestServer();
const db = async () => (await import('../../db/pool.js')).pool;

interface ReviewItem {
  kind: 'comic' | 'chapter';
  comic: { slug: string; title: string; status: string; publishedBy: string; isAdult: boolean; contentWarning: string | null };
  chapter: { number: number; title: string; panelCount: number } | null;
  submittedAt: string;
}
interface Queue {
  items: ReviewItem[];
  counts: { comics: number; chapters: number };
}

const codeOf = async (res: Response) => `${res.status} ${((await res.json()) as { code: string }).code}`;

async function auditOf(res: Response) {
  const { rows } = await (await db()).query<{ action: string; actor_id: number; entity_type: string; before: unknown; after: unknown }>(
    'SELECT action, actor_id, entity_type, before, after FROM audit_log WHERE request_id = $1',
    [res.headers.get('x-request-id')],
  );
  return rows;
}

let n = 0;
async function authorWork(spec: { comicStatus?: 'pending' | 'approved'; chapters?: { number: number; status: 'pending' | 'draft' | 'approved' }[] } = {}) {
  const author = await createUser('author');
  const comic = await createComic({ name: `rev-${++n}`, status: spec.comicStatus ?? 'pending', authorId: author.id, chapters: spec.chapters ?? [] });
  return { author, comic };
}

test('Seguridad: la API del admin exige sesión (401) y rol admin (403), también un lector y un autor', async () => {
  assert.equal(await codeOf(await api(srv, 'GET', '/api/admin/review')), '401 UNAUTHENTICATED');
  for (const kind of ['reader', 'author', 'premium'] as const) {
    const user = await createUser(kind);
    assert.equal(await codeOf(await api(srv, 'GET', '/api/admin/review', { cookie: user.cookie })), '403 FORBIDDEN', kind);
    assert.equal(await codeOf(await api(srv, 'POST', `/api/admin/comics/c${RUN}-x/approve`, { cookie: user.cookie })), '403 FORBIDDEN', kind);
  }
});

test('RN-05: la cola trae obras y capítulos pending, sin borradores, sin retirados ni capítulos de obras rechazadas (D2)', async () => {
  const admin = await createUser('admin');
  const { comic } = await authorWork({ chapters: [{ number: 1, status: 'pending' }, { number: 2, status: 'draft' }] });
  const { comic: approved } = await authorWork({ comicStatus: 'approved', chapters: [{ number: 1, status: 'approved' }, { number: 2, status: 'pending' }] });
  const { comic: rejected } = await authorWork({ chapters: [{ number: 1, status: 'pending' }] });
  await (await db()).query(`UPDATE comics SET status = 'rejected', rejection_reason = 'No' WHERE id = $1`, [rejected.id]);
  const { comic: withdrawn } = await authorWork({ chapters: [{ number: 1, status: 'pending' }] });
  await (await db()).query('UPDATE comics SET deleted_at = now() WHERE id = $1', [withdrawn.id]);

  const res = await api(srv, 'GET', '/api/admin/review', { cookie: admin.cookie });
  assert.equal(res.status, 200);
  const queue = (await res.json()) as Queue;
  const mine = (slug: string) => queue.items.filter((item) => item.comic.slug === slug);
  assert.deepEqual(mine(comic.slug).map((item) => [item.kind, item.chapter?.number ?? null]), [['comic', null], ['chapter', 1]]);
  assert.deepEqual(mine(approved.slug).map((item) => [item.kind, item.chapter?.number ?? null, item.comic.status]), [['chapter', 2, 'approved']]);
  assert.deepEqual(mine(rejected.slug), []);
  assert.deepEqual(mine(withdrawn.slug), []);
  const chapterItem = mine(comic.slug)[1]!;
  assert.deepEqual(chapterItem.chapter, { number: 1, title: 'Capítulo 1', panelCount: 2 });
  assert.equal(chapterItem.comic.publishedBy, `author ${RUN}`);
  const times = queue.items.map((item) => Date.parse(item.submittedAt));
  assert.deepEqual(times, [...times].sort((a, b) => a - b), 'del envío más antiguo al más reciente');
  assert.ok(queue.counts.comics >= 1 && queue.counts.chapters >= 2);
});

test('RN-05: aprobar una obra la publica y audita comic.approve; repetirlo da 409', async () => {
  const admin = await createUser('admin');
  const { comic } = await authorWork();
  const res = await api(srv, 'POST', `/api/admin/comics/${comic.slug}/approve`, { cookie: admin.cookie });
  assert.equal(res.status, 204);
  assert.deepEqual(await auditOf(res), [
    { action: 'comic.approve', actor_id: admin.id, entity_type: 'comics', before: { status: 'pending' }, after: { status: 'approved' } },
  ]);
  assert.equal((await api(srv, 'GET', `/api/comics/${comic.slug}`)).status, 200, 'ya es pública');
  assert.equal(await codeOf(await api(srv, 'POST', `/api/admin/comics/${comic.slug}/approve`, { cookie: admin.cookie })), '409 CONFLICT');
});

test('RN-17: una obra marcada +18 no se aprueba (409) y se rechaza con motivo', async () => {
  const admin = await createUser('admin');
  const { comic } = await authorWork();
  await (await db()).query('UPDATE comics SET is_adult = true WHERE id = $1', [comic.id]);
  const res = await api(srv, 'POST', `/api/admin/comics/${comic.slug}/approve`, { cookie: admin.cookie });
  assert.equal(res.status, 409);
  assert.match(((await res.json()) as { message: string }).message, /\+18/);
  const reject = await api(srv, 'POST', `/api/admin/comics/${comic.slug}/reject`, { cookie: admin.cookie, body: { reason: 'Contenido +18' } });
  assert.equal(reject.status, 204);
});

test('RN-05: rechazar exige un motivo de 1 a 500 caracteres; el autor lo ve y se audita comic.reject', async () => {
  const admin = await createUser('admin');
  const { author, comic } = await authorWork();
  for (const body of [{}, { reason: '   ' }, { reason: 'x'.repeat(501) }]) {
    const res = await api(srv, 'POST', `/api/admin/comics/${comic.slug}/reject`, { cookie: admin.cookie, body });
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 30));
    assert.ok(((await res.json()) as { fields: Record<string, string> }).fields['reason']);
  }
  const res = await api(srv, 'POST', `/api/admin/comics/${comic.slug}/reject`, { cookie: admin.cookie, body: { reason: '  La licencia no permite uso comercial  ' } });
  assert.equal(res.status, 204);
  const [entry] = await auditOf(res);
  assert.deepEqual(entry?.after, { status: 'rejected', rejectionReason: 'La licencia no permite uso comercial' });
  const mine = (await (await api(srv, 'GET', '/api/author/comics', { cookie: author.cookie })).json()) as {
    comics: { slug: string; status: string; rejectionReason: string | null }[];
  };
  const shown = mine.comics.find((c) => c.slug === comic.slug);
  assert.deepEqual([shown?.status, shown?.rejectionReason], ['rejected', 'La licencia no permite uso comercial']);
});

test('RN-05: aprobar un capítulo fija published_at y audita chapter.approve; con la obra aún pending no es público', async () => {
  const admin = await createUser('admin');
  const { comic } = await authorWork({ chapters: [{ number: 1, status: 'pending' }] });
  const res = await api(srv, 'POST', `/api/admin/comics/${comic.slug}/chapters/1/approve`, { cookie: admin.cookie });
  assert.equal(res.status, 204);
  const [entry] = await auditOf(res);
  assert.equal(entry?.action, 'chapter.approve');
  assert.deepEqual((entry?.before as object), { status: 'pending', publishedAt: null });
  assert.match(String((entry?.after as { publishedAt: string }).publishedAt), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal((await api(srv, 'POST', `/api/comics/${comic.slug}/chapters/1/read`)).status, 404, 'la obra sigue sin aprobar');
  await api(srv, 'POST', `/api/admin/comics/${comic.slug}/approve`, { cookie: admin.cookie });
  assert.equal((await api(srv, 'POST', `/api/comics/${comic.slug}/chapters/1/read`)).status, 200, 'aprobada la obra, el capítulo se lee');
});

test('RN-09: rechazar un capítulo guarda el motivo y libera su número para el autor', async () => {
  const admin = await createUser('admin');
  const { author, comic } = await authorWork({ comicStatus: 'approved', chapters: [{ number: 1, status: 'pending' }] });
  const res = await api(srv, 'POST', `/api/admin/comics/${comic.slug}/chapters/1/reject`, { cookie: admin.cookie, body: { reason: 'Faltan viñetas' } });
  assert.equal(res.status, 204);
  assert.deepEqual((await auditOf(res))[0]?.after, { status: 'rejected', rejectionReason: 'Faltan viñetas' });
  const again = await api(srv, 'POST', `/api/author/comics/${comic.slug}/chapters`, { cookie: author.cookie, body: { number: 1 } });
  assert.equal(again.status, 201, 'el número 1 queda libre');
});

test('RN-05: errores de capítulo: borrador o ya aprobado (409), obra rechazada (409), retirada (410), inexistente (404)', async () => {
  const admin = await createUser('admin');
  const { comic } = await authorWork({ comicStatus: 'approved', chapters: [{ number: 1, status: 'draft' }, { number: 2, status: 'approved' }, { number: 3, status: 'pending' }] });
  const path = (number: number, action = 'approve') => `/api/admin/comics/${comic.slug}/chapters/${number}/${action}`;
  assert.equal(await codeOf(await api(srv, 'POST', path(1), { cookie: admin.cookie })), '409 CONFLICT');
  assert.equal(await codeOf(await api(srv, 'POST', path(2), { cookie: admin.cookie })), '409 CONFLICT');
  assert.equal(await codeOf(await api(srv, 'POST', path(9), { cookie: admin.cookie })), '404 NOT_FOUND');
  assert.equal(await codeOf(await api(srv, 'POST', `/api/admin/comics/c${RUN}-no-existe/approve`, { cookie: admin.cookie })), '404 NOT_FOUND');
  const pool = await db();
  await pool.query(`UPDATE comics SET status = 'rejected', rejection_reason = 'No' WHERE id = $1`, [comic.id]);
  assert.equal(await codeOf(await api(srv, 'POST', path(3), { cookie: admin.cookie })), '409 CONFLICT');
  await pool.query('UPDATE comics SET deleted_at = now() WHERE id = $1', [comic.id]);
  assert.equal(await codeOf(await api(srv, 'POST', path(3), { cookie: admin.cookie })), '410 GONE');
  assert.equal(await codeOf(await api(srv, 'POST', `/api/admin/comics/${comic.slug}/approve`, { cookie: admin.cookie })), '410 GONE');
});

test('Seguridad: dos admins aprueban a la vez la misma obra: uno 204 y otro 409, con una sola entrada de auditoría', async () => {
  const [one, two] = [await createUser('admin'), await createUser('admin')];
  const { comic } = await authorWork();
  const results = await Promise.all([one, two].map((admin) => api(srv, 'POST', `/api/admin/comics/${comic.slug}/approve`, { cookie: admin.cookie })));
  assert.deepEqual(results.map((r) => r.status).sort(), [204, 409]);
  const { rows } = await (await db()).query(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'comic.approve' AND entity_id = $1`, [String(comic.id)]);
  assert.equal(rows[0]!.n, 1);
});
