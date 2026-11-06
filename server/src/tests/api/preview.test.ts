import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createComic, createUser, type TestComic, type TestUser } from './reading-fixtures.js';

// Vista previa del dueño y del admin (mapa de rutas; contrato del bloque 3, D10) contra koma_test.
const storageDir = mkdtempSync(path.join(tmpdir(), 'koma-preview-'));
process.env['STORAGE_DRIVER'] = 'local';
process.env['STORAGE_LOCAL_DIR'] = storageDir;

const srv = startTestServer();
after(() => rm(storageDir, { recursive: true, force: true }));

const db = async () => (await import('../../db/pool.js')).pool;

interface ComicBody {
  status: string;
  chapters: { number: number; status: string; publishedAt: string | null; access: string }[];
}
interface ReadingBody {
  chapter: { number: number; prev: number | null; next: number | null };
  panels: { comments: number }[];
  ads: { interstitial: unknown; end: unknown };
  balance: unknown;
  preview: boolean;
}

let owner: TestUser;
let admin: TestUser;
let otherAuthor: TestUser;
let reader: TestUser;
let pendingComic: TestComic; // obra en revisión del autor, con un borrador
let approvedComic: TestComic; // obra publicada del autor con capítulos sin publicar

before(async () => {
  owner = await createUser('author');
  admin = await createUser('admin');
  otherAuthor = await createUser('author');
  reader = await createUser('reader');
  pendingComic = await createComic({ name: 'previa-pendiente', status: 'pending', authorId: owner.id, chapters: [{ number: 1, status: 'draft', panels: 3 }] });
  approvedComic = await createComic({
    name: 'previa-publicada',
    authorId: owner.id,
    chapters: [
      { number: 1 },
      { number: 2, status: 'draft' },
      { number: 3, status: 'pending' },
      { number: 4 },
      { number: 5, status: 'rejected' },
      { number: 6, withdrawn: true },
    ],
  });
});

const comicOf = (slug: string, user?: TestUser) => api(srv, 'GET', `/api/comics/${slug}`, user ? { cookie: user.cookie } : {});
const read = (slug: string, number: number, user?: TestUser) =>
  api(srv, 'POST', `/api/comics/${slug}/chapters/${number}/read`, user ? { cookie: user.cookie } : {});
const page = (url: string, user?: TestUser) => fetch(`${srv.baseUrl}${url}`, { redirect: 'manual', ...(user && { headers: { Cookie: user.cookie } }) });

async function readOk(slug: string, number: number, user: TestUser): Promise<ReadingBody> {
  const res = await read(slug, number, user);
  assert.equal(res.status, 200, await res.clone().text());
  return ((await res.json()) as { reading: ReadingBody }).reading;
}

// Lo que escribe una lectura: chapter_reads, reading_credits y chapter_read_counts.
async function writes(userId: number, chapterIds: number[]) {
  const pool = await db();
  const one = async (sql: string, params: unknown[]) => Number((await pool.query<{ n: string }>(sql, params)).rows[0]!.n);
  return {
    reads: await one('SELECT count(*) AS n FROM chapter_reads WHERE user_id = $1', [userId]),
    credits: await one('SELECT count(*) AS n FROM reading_credits WHERE user_id = $1', [userId]),
    counts: await one('SELECT coalesce(sum(user_reads + guest_reads), 0) AS n FROM chapter_read_counts WHERE chapter_id = ANY($1::int[])', [chapterIds]),
  };
}

// ── Ficha ─────────────────────────────────────────────────────────────────────

test('D10: el autor dueño y el admin ven la ficha de una obra pending con su status; otro autor, un lector y el invitado, 404', async () => {
  for (const user of [owner, admin]) {
    const res = await comicOf(pendingComic.slug, user);
    assert.equal(res.status, 200);
    const { comic } = (await res.json()) as { comic: ComicBody };
    assert.equal(comic.status, 'pending');
    assert.deepEqual(comic.chapters.map(({ number, status, publishedAt, access }) => ({ number, status, publishedAt, access })), [
      { number: 1, status: 'draft', publishedAt: null, access: 'free' },
    ]);
  }
  for (const user of [otherAuthor, reader, undefined]) assert.equal((await comicOf(pendingComic.slug, user)).status, 404);
  assert.equal((await page(`/obra/${pendingComic.slug}`, owner)).status, 200);
  assert.equal((await page(`/obra/${pendingComic.slug}`, admin)).status, 200);
  assert.equal((await page(`/obra/${pendingComic.slug}`, otherAuthor)).status, 404);
  assert.equal((await page(`/obra/${pendingComic.slug}`)).status, 404);
});

test('D10: en una obra publicada, el dueño y el admin ven también los capítulos draft y pending; los demás, solo los aprobados', async () => {
  const numbers = async (user?: TestUser) => ((await (await comicOf(approvedComic.slug, user)).json()) as { comic: ComicBody }).comic.chapters;
  for (const user of [owner, admin]) {
    const chapters = await numbers(user);
    assert.deepEqual(chapters.map(({ number, status }) => [number, status]), [
      [1, 'approved'],
      [2, 'draft'],
      [3, 'pending'],
      [4, 'approved'],
    ]);
    assert.equal(chapters[1]?.access, 'free');
    assert.equal(chapters[1]?.publishedAt, null);
    assert.ok(chapters[0]?.publishedAt);
  }
  for (const user of [otherAuthor, reader, undefined]) {
    assert.deepEqual((await numbers(user)).map(({ number, status }) => [number, status]), [
      [1, 'approved'],
      [4, 'approved'],
    ]);
  }
});

test('D10: una obra rechazada no tiene vista previa (404) y una retirada responde 410 también a su dueño', async () => {
  const rejected = await createComic({ name: 'previa-rechazada', status: 'pending', authorId: owner.id, chapters: [{ number: 1, status: 'draft' }] });
  await (await db()).query(`UPDATE comics SET status = 'rejected', rejection_reason = 'Motivo' WHERE id = $1`, [rejected.id]);
  const withdrawn = await createComic({ name: 'previa-retirada', status: 'pending', withdrawn: true, authorId: owner.id, chapters: [{ number: 1, status: 'draft' }] });
  for (const user of [owner, admin]) {
    assert.equal((await comicOf(rejected.slug, user)).status, 404);
    assert.equal((await read(rejected.slug, 1, user)).status, 404);
    assert.equal((await comicOf(withdrawn.slug, user)).status, 410);
    assert.equal((await read(withdrawn.slug, 1, user)).status, 410);
    assert.equal((await page(`/leer/${withdrawn.slug}/1`, user)).status, 410);
  }
});

// ── Lectura ───────────────────────────────────────────────────────────────────

test('D10: el dueño lee un borrador en vista previa: sin anuncios, saldo ni comentarios, y sin escribir nada', async () => {
  const chapterIds = [...pendingComic.chapterIds.values()];
  const before = await writes(owner.id, chapterIds);
  const reading = await readOk(pendingComic.slug, 1, owner);
  assert.equal(reading.preview, true);
  assert.deepEqual(reading.ads, { interstitial: null, end: null });
  assert.equal(reading.balance, null);
  assert.equal(reading.panels.length, 3);
  assert.ok(reading.panels.every((panel) => panel.comments === 0));
  assert.deepEqual(await writes(owner.id, chapterIds), before);
  assert.equal((await page(`/leer/${pendingComic.slug}/1`, owner)).status, 200);
});

test('D10: el admin lee un capítulo pending en vista previa sin registrar la lectura ni contarla', async () => {
  const chapterId = approvedComic.chapterIds.get('3:pending')!;
  const before = await writes(admin.id, [chapterId]);
  const reading = await readOk(approvedComic.slug, 3, admin);
  assert.equal(reading.preview, true);
  assert.deepEqual(await writes(admin.id, [chapterId]), before);
});

test('D10: otro autor, un lector y el invitado no leen un capítulo draft o pending (404), ni su página', async () => {
  for (const user of [otherAuthor, reader, undefined]) {
    assert.equal((await read(approvedComic.slug, 2, user)).status, 404);
    assert.equal((await read(approvedComic.slug, 3, user)).status, 404);
    assert.equal((await read(pendingComic.slug, 1, user)).status, 404);
    assert.equal((await page(`/leer/${approvedComic.slug}/2`, user)).status, 404);
  }
});

test('D10: prev y next recorren los capítulos que esa persona puede ver', async () => {
  const ownerView = await readOk(approvedComic.slug, 1, owner);
  assert.deepEqual([ownerView.chapter.prev, ownerView.chapter.next], [null, 2]);
  const draftView = await readOk(approvedComic.slug, 3, owner);
  assert.deepEqual([draftView.chapter.prev, draftView.chapter.next], [2, 4]);
  const readerView = await readOk(approvedComic.slug, 1, await createUser('premium'));
  assert.deepEqual([readerView.chapter.prev, readerView.chapter.next], [null, 4]);
  assert.equal(readerView.preview, false);
});

test('D10: un capítulo aprobado sigue la lectura normal también para su dueño (sin vista previa)', async () => {
  const reading = await readOk(approvedComic.slug, 4, owner);
  assert.equal(reading.preview, false);
});

test('Seguridad: en la vista previa no se comenta: la lista y la publicación de comentarios de un borrador dan 404', async () => {
  const url = `/api/comics/${pendingComic.slug}/chapters/1/panels/1/comments`;
  assert.equal((await api(srv, 'GET', url, { cookie: owner.cookie })).status, 404);
  assert.equal((await api(srv, 'POST', url, { body: { body: 'Hola' }, cookie: owner.cookie })).status, 404);
});
