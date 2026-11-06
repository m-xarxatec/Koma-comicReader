import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createComic, createUser, type TestComic, type TestUser } from './reading-fixtures.js';

// Retirar obra (D13) y capítulo (CU-30; RN-06; contrato del bloque 3) contra koma_test.
const storageDir = mkdtempSync(path.join(tmpdir(), 'koma-withdraw-'));
process.env['STORAGE_DRIVER'] = 'local';
process.env['STORAGE_LOCAL_DIR'] = storageDir;

const srv = startTestServer();
after(() => rm(storageDir, { recursive: true, force: true }));

const db = async () => (await import('../../db/pool.js')).pool;

const withdrawComic = (slug: string, user: TestUser | null) =>
  api(srv, 'POST', `/api/comics/${slug}/withdraw`, user ? { cookie: user.cookie } : {});
const withdrawChapter = (slug: string, number: number, user: TestUser | null) =>
  api(srv, 'POST', `/api/author/comics/${slug}/chapters/${number}/withdraw`, user ? { cookie: user.cookie } : {});
const read = (slug: string, number: number, user?: TestUser) =>
  api(srv, 'POST', `/api/comics/${slug}/chapters/${number}/read`, user ? { cookie: user.cookie } : {});
const page = (url: string) => fetch(`${srv.baseUrl}${url}`, { redirect: 'manual' });

async function assertError(res: Response, status: number, code: string) {
  assert.equal(res.status, status, `${res.url}: ${await res.clone().text()}`);
  assert.equal(((await res.json()) as { code: string }).code, code);
}

async function auditOf(res: Response) {
  const { findByRequestId } = await import('../../modules/audit/audit.repository.js');
  return findByRequestId(await db(), res.headers.get('x-request-id') ?? '');
}

let comics = 0;
async function authorComic(spec: Partial<Parameters<typeof createComic>[0]> = {}): Promise<{ author: TestUser; comic: TestComic }> {
  const author = await createUser('author');
  const comic = await createComic({ name: `retirar-${++comics}`, authorId: author.id, chapters: [{ number: 1 }, { number: 2 }], ...spec });
  return { author, comic };
}

// ── Retirar obra (RN-06, D13) ─────────────────────────────────────────────────

test('RN-06: el autor retira su obra (204); la ficha, la página, el lector y los comentarios responden 410', async () => {
  const { author, comic } = await authorComic();
  assert.equal((await api(srv, 'GET', `/api/comics/${comic.slug}`)).status, 200);
  const search = async () =>
    ((await (await api(srv, 'GET', `/api/comics?q=${encodeURIComponent(`Obra retirar-1`)}`)).json()) as { total: number }).total;
  assert.equal(await search(), 1, 'antes de retirarla sale en el catálogo');
  const res = await withdrawComic(comic.slug, author);
  assert.equal(res.status, 204);

  await assertError(await api(srv, 'GET', `/api/comics/${comic.slug}`), 410, 'GONE');
  assert.equal((await page(`/obra/${comic.slug}`)).status, 410);
  assert.equal((await page(`/leer/${comic.slug}/1`)).status, 410);
  await assertError(await read(comic.slug, 1), 410, 'GONE');
  await assertError(await api(srv, 'GET', `/api/comics/${comic.slug}/chapters/1/panels/1/comments`), 410, 'GONE');
  assert.equal(await search(), 0, 'deja de salir en el catálogo');
  const mine = (await (await api(srv, 'GET', '/api/author/comics', { cookie: author.cookie })).json()) as { comics: unknown[] };
  assert.deepEqual(mine.comics, [], 'y en la lista del autor');
});

test('RN-06: la retirada se audita como comic.withdraw con deletedAt antes y después; una segunda da 409', async () => {
  const { author, comic } = await authorComic();
  const res = await withdrawComic(comic.slug, author);
  assert.equal(res.status, 204);
  const [entry, ...rest] = await auditOf(res);
  assert.equal(rest.length, 0);
  assert.equal(entry?.action, 'comic.withdraw');
  assert.equal(entry?.actorId, author.id);
  assert.equal(entry?.entityType, 'comics');
  assert.equal(entry?.entityId, String(comic.id));
  assert.deepEqual(entry?.before, { deletedAt: null });
  const { rows } = await (await db()).query<{ deleted_at: Date }>('SELECT deleted_at FROM comics WHERE id = $1', [comic.id]);
  assert.deepEqual(entry?.after, { deletedAt: rows[0]!.deleted_at.toISOString() });

  const again = await withdrawComic(comic.slug, author);
  await assertError(again, 409, 'CONFLICT');
  assert.deepEqual(await auditOf(again), []);
});

test('RN-06: el admin retira cualquier obra, también una importada (sin autor), con su auditoría', async () => {
  const admin = await createUser('admin');
  const imported = await createComic({ name: 'retirar-importada', chapters: [{ number: 1 }] });
  const { comic } = await authorComic();
  for (const target of [imported, comic]) {
    const res = await withdrawComic(target.slug, admin);
    assert.equal(res.status, 204);
    assert.equal((await auditOf(res))[0]?.actorId, admin.id);
    await assertError(await api(srv, 'GET', `/api/comics/${target.slug}`), 410, 'GONE');
  }
});

test('Seguridad: otro autor, un lector o un autor sin el rol no retiran la obra (403); sin sesión 401; si no existe, 404', async () => {
  const { author, comic } = await authorComic();
  for (const kind of ['author', 'reader', 'premium'] as const) {
    await assertError(await withdrawComic(comic.slug, await createUser(kind)), 403, 'FORBIDDEN');
  }
  await assertError(await withdrawComic(comic.slug, null), 401, 'UNAUTHENTICATED');
  await assertError(await withdrawComic('no-existe-nunca', author), 404, 'NOT_FOUND');
  await assertError(await withdrawComic('No_Valido', author), 404, 'NOT_FOUND');
  await (await db()).query('UPDATE users SET is_author = false WHERE id = $1', [author.id]);
  await assertError(await withdrawComic(comic.slug, author), 403, 'FORBIDDEN');
  assert.equal((await api(srv, 'GET', `/api/comics/${comic.slug}`)).status, 200, 'sigue publicada');
});

test('Seguridad: una obra ajena ya retirada da 403, no 409 (no revela su estado)', async () => {
  const { author, comic } = await authorComic();
  assert.equal((await withdrawComic(comic.slug, author)).status, 204);
  await assertError(await withdrawComic(comic.slug, await createUser('author')), 403, 'FORBIDDEN');
});

test('Seguridad: retirar una obra exige el Origin propio (CSRF)', async () => {
  const { author, comic } = await authorComic();
  const res = await fetch(`${srv.baseUrl}/api/comics/${comic.slug}/withdraw`, { method: 'POST', headers: { Cookie: author.cookie } });
  await assertError(res, 403, 'CSRF');
  assert.equal((await api(srv, 'GET', `/api/comics/${comic.slug}`)).status, 200);
});

// ── Retirar capítulo (CU-30) ──────────────────────────────────────────────────

test('RN-06: retirar un capítulo aprobado: el lector responde 410, deja de salir en la ficha y se audita', async () => {
  const { author, comic } = await authorComic();
  const res = await withdrawChapter(comic.slug, 2, author);
  assert.equal(res.status, 204);
  await assertError(await read(comic.slug, 2), 410, 'GONE');
  assert.equal((await page(`/leer/${comic.slug}/2`)).status, 410);
  const { comic: dto } = (await (await api(srv, 'GET', `/api/comics/${comic.slug}`)).json()) as { comic: { chapters: { number: number }[] } };
  assert.deepEqual(dto.chapters.map((chapter) => chapter.number), [1]);
  const [entry] = await auditOf(res);
  assert.equal(entry?.action, 'chapter.withdraw');
  assert.equal(entry?.actorId, author.id);
  assert.equal(entry?.entityType, 'chapters');
  assert.equal(entry?.entityId, String(comic.chapterIds.get('2')));
  assert.deepEqual(entry?.before, { deletedAt: null });
  assert.ok(typeof (entry?.after as { deletedAt?: unknown })?.deletedAt === 'string');
});

test('RN-09: el número de un capítulo retirado queda libre y el nuevo hereda su URL', async () => {
  const { author, comic } = await authorComic();
  assert.equal((await withdrawChapter(comic.slug, 2, author)).status, 204);
  const res = await api(srv, 'POST', `/api/author/comics/${comic.slug}/chapters`, { body: { number: 2 }, cookie: author.cookie });
  assert.equal(res.status, 201);
  // Un capítulo ya retirado no es el vivo de ese número: el nuevo (draft) sí.
  assert.equal((await withdrawChapter(comic.slug, 2, author)).status, 204);
  await assertError(await withdrawChapter(comic.slug, 2, author), 404, 'NOT_FOUND');
});

test('RN-06: se retira un capítulo en draft o pending, también en una obra rechazada', async () => {
  const { author, comic } = await authorComic({ status: 'pending', chapters: [{ number: 1, status: 'draft' }, { number: 2, status: 'pending' }] });
  assert.equal((await withdrawChapter(comic.slug, 1, author)).status, 204);
  await (await db()).query(`UPDATE comics SET status = 'rejected', rejection_reason = 'Motivo' WHERE id = $1`, [comic.id]);
  assert.equal((await withdrawChapter(comic.slug, 2, author)).status, 204);
  const { rows } = await (await db()).query<{ n: number }>('SELECT count(*)::int AS n FROM chapters WHERE comic_id = $1 AND deleted_at IS NULL', [comic.id]);
  assert.equal(rows[0]!.n, 0);
});

test('Seguridad: retirar un capítulo de una obra ajena da 403; de una retirada, 410; sin sesión 401; el admin no (no es autor)', async () => {
  const { author, comic } = await authorComic();
  await assertError(await withdrawChapter(comic.slug, 1, await createUser('author')), 403, 'FORBIDDEN');
  await assertError(await withdrawChapter(comic.slug, 1, await createUser('admin')), 403, 'FORBIDDEN');
  await assertError(await withdrawChapter(comic.slug, 1, null), 401, 'UNAUTHENTICATED');
  await assertError(await withdrawChapter(comic.slug, 9, author), 404, 'NOT_FOUND');
  assert.equal((await withdrawComic(comic.slug, author)).status, 204);
  await assertError(await withdrawChapter(comic.slug, 1, author), 410, 'GONE');
});
