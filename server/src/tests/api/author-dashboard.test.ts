import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createComic, createUser, type TestComic, type TestUser } from './reading-fixtures.js';

// Panel del autor (contrato del bloque 3, "Panel del autor"; CU-31 recortado, RN-19).

const srv = startTestServer();
const db = async () => (await import('../../db/pool.js')).pool;

interface Reads {
  total: number;
  last7: number;
  last30: number;
}

interface Dashboard {
  displayName: string;
  authorSince: string;
  today: string;
  comics: { pending: number; approved: number; rejected: number };
  chapters: { draft: number; pending: number; approved: number; rejected: number };
  reads: Reads;
  works: { slug: string; title: string; status: string; reads: Reads; chapters: { number: number; title: string; reads: Reads; abandonment: unknown }[] }[];
  recentComments: {
    id: number;
    body: string;
    authorName: string;
    createdAt: string;
    comic: { slug: string; title: string };
    chapterNumber: number;
    panelPosition: number;
  }[];
}

const dashboard = async (user: TestUser): Promise<Dashboard> => {
  const res = await api(srv, 'GET', '/api/author/dashboard', { cookie: user.cookie });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  return ((await res.json()) as { dashboard: Dashboard }).dashboard;
};

// Lecturas de un capítulo `daysAgo` días antes de hoy (día de Europe/Madrid, como las escribe la lectura).
async function addReads(chapterId: number, daysAgo: number, guest: number, user: number): Promise<void> {
  await (await db()).query(
    `INSERT INTO chapter_read_counts (chapter_id, day, guest_reads, user_reads)
     VALUES ($1, (now() AT TIME ZONE 'Europe/Madrid')::date - $2::int, $3, $4)`,
    [chapterId, daysAgo, guest, user],
  );
}

let author: TestUser;
let main: TestComic; // aprobada: caps. 1 y 2 aprobados, 3 borrador, 4 pending, 5 rechazado, 6 retirado
let older: TestComic; // pending, más antigua

before(async () => {
  author = await createUser('author');
  older = await createComic({ name: 'panel-antigua', status: 'pending', authorId: author.id, chapters: [{ number: 1, status: 'draft' }] });
  main = await createComic({
    name: 'panel',
    authorId: author.id,
    chapters: [
      { number: 1, panels: 3 },
      { number: 2 },
      { number: 3, status: 'draft' },
      { number: 4, status: 'pending' },
      { number: 5, status: 'rejected' },
      { number: 6, withdrawn: true },
    ],
  });
  // La más reciente primero: `main` se creó después, pero se fuerza el orden por created_at.
  await (await db()).query(`UPDATE comics SET created_at = now() - interval '1 day' WHERE id = $1`, [older.id]);
});

test('Seguridad: el panel exige sesión (401) y el rol de autor (403 para un lector y para el admin)', async () => {
  assert.equal((await api(srv, 'GET', '/api/author/dashboard')).status, 401);
  for (const kind of ['reader', 'admin'] as const) {
    const res = await api(srv, 'GET', '/api/author/dashboard', { cookie: (await createUser(kind)).cookie });
    assert.equal(res.status, 403, kind);
  }
});

test('RN-19: un autor sin obras ve ceros, su nombre, "En Koma desde" y el día de referencia', async () => {
  const fresh = await createUser('author');
  const data = await dashboard(fresh);
  const { rows } = await (await db()).query<{ created_at: Date; display_name: string; today: string }>(
    `SELECT created_at, display_name, to_char((now() AT TIME ZONE 'Europe/Madrid')::date, 'YYYY-MM-DD') AS today FROM users WHERE id = $1`,
    [fresh.id],
  );
  assert.equal(data.displayName, rows[0]!.display_name);
  assert.equal(data.authorSince, rows[0]!.created_at.toISOString());
  assert.equal(data.today, rows[0]!.today);
  assert.deepEqual(data.comics, { pending: 0, approved: 0, rejected: 0 });
  assert.deepEqual(data.chapters, { draft: 0, pending: 0, approved: 0, rejected: 0 });
  assert.deepEqual(data.reads, { total: 0, last7: 0, last30: 0 });
  assert.deepEqual(data.works, []);
  assert.deepEqual(data.recentComments, []);
});

test('RN-19: ventanas de 7 y 30 días con hoy incluido; invitados y registrados se suman', async () => {
  const solo = await createUser('author');
  const comic = await createComic({ name: 'panel-ventanas', authorId: solo.id, chapters: [{ number: 1 }] });
  const chapterId = comic.chapterIds.get('1')!;
  await addReads(chapterId, 0, 1, 1); // hoy: 2
  await addReads(chapterId, 6, 3, 0); // hoy − 6: dentro de 7
  await addReads(chapterId, 7, 0, 4); // hoy − 7: fuera de 7, dentro de 30
  await addReads(chapterId, 29, 5, 0); // hoy − 29: dentro de 30
  await addReads(chapterId, 30, 0, 6); // hoy − 30: fuera de 30
  await addReads(chapterId, 90, 10, 10); // solo en el total
  const data = await dashboard(solo);
  const expected = { total: 40, last7: 5, last30: 14 };
  assert.deepEqual(data.reads, expected);
  assert.deepEqual(data.works[0]!.reads, expected);
  // Bloque 5 (RN-21): cada capítulo trae también su abandono; sin progreso, ceros.
  const noAbandonment = { panels: 2, readersWithData: 0, reachedEnd: 0, reachedEndPct: 0, dropPanel: null, dropReaders: 0 };
  assert.deepEqual(data.works[0]!.chapters, [{ number: 1, title: 'Capítulo 1', reads: expected, abandonment: noAbandonment }]);
});

test('RN-19: la obra suma solo sus capítulos approved vivos; sin obras retiradas ni de otro autor; de la más reciente a la más antigua', async () => {
  await addReads(main.chapterIds.get('1')!, 1, 10, 2);
  await addReads(main.chapterIds.get('2')!, 2, 4, 1);
  await addReads(main.chapterIds.get('6:approved:retirado')!, 1, 100, 100); // capítulo retirado: no cuenta

  const gone = await createComic({ name: 'panel-retirada', authorId: author.id, withdrawn: true, chapters: [{ number: 1 }] });
  await addReads(gone.chapterIds.get('1')!, 1, 50, 50);
  const foreign = await createComic({ name: 'panel-ajena', authorId: (await createUser('author')).id, chapters: [{ number: 1 }] });
  await addReads(foreign.chapterIds.get('1')!, 1, 70, 70);

  const data = await dashboard(author);
  assert.deepEqual(
    data.works.map((work) => work.slug),
    [main.slug, older.slug],
  );
  const [work, pending] = data.works;
  assert.equal(work!.status, 'approved');
  assert.deepEqual(
    work!.chapters.map((chapter) => [chapter.number, chapter.reads.total]),
    [
      [1, 12],
      [2, 5],
    ],
  );
  assert.deepEqual(work!.reads, { total: 17, last7: 17, last30: 17 });
  assert.deepEqual(pending, { slug: older.slug, title: 'Obra panel-antigua', status: 'pending', reads: { total: 0, last7: 0, last30: 0 }, chapters: [] });
  assert.deepEqual(data.reads, { total: 17, last7: 17, last30: 17 });
});

test('RN-19: obras y capítulos por estado, sin retirados; un rechazado cuenta aunque tenga sustituto', async () => {
  const solo = await createUser('author');
  await createComic({ name: 'panel-estados-a', authorId: solo.id, chapters: [{ number: 1 }, { number: 2, status: 'draft' }, { number: 3, status: 'rejected' }, { number: 3, status: 'pending' }] });
  await createComic({ name: 'panel-estados-b', authorId: solo.id, status: 'pending', chapters: [{ number: 1, status: 'pending' }, { number: 2, status: 'draft', withdrawn: true }] });
  const rejected = await createComic({ name: 'panel-estados-c', authorId: solo.id, status: 'pending', chapters: [{ number: 1, status: 'draft' }] });
  await (await db()).query(`UPDATE comics SET status = 'rejected', rejection_reason = 'Motivo' WHERE id = $1`, [rejected.id]);
  await createComic({ name: 'panel-estados-d', authorId: solo.id, withdrawn: true, chapters: [{ number: 1 }] });

  const data = await dashboard(solo);
  assert.deepEqual(data.comics, { pending: 1, approved: 1, rejected: 1 });
  assert.deepEqual(data.chapters, { draft: 2, pending: 2, approved: 1, rejected: 1 });
});

test('RN-19: los 10 comentarios más recientes en sus obras, sin ocultos, eliminados, retirados ni ajenos', async () => {
  const solo = await createUser('author');
  const reader = await createUser('reader');
  const comic = await createComic({ name: 'panel-comentarios', authorId: solo.id, chapters: [{ number: 1, panels: 3 }, { number: 2 }, { number: 3, withdrawn: true }] });
  const foreign = await createComic({ name: 'panel-comentarios-ajena', chapters: [{ number: 1 }] });
  const pool = await db();
  const panelId = async (chapterId: number, position: number) =>
    (await pool.query<{ id: number }>('SELECT id FROM panels WHERE chapter_id = $1 AND position = $2', [chapterId, position])).rows[0]!.id;
  const comment = async (panel: number, body: string, minutesAgo: number, extra = '') =>
    (
      await pool.query<{ id: number }>(
        `INSERT INTO comments (panel_id, user_id, body, created_at${extra ? `, ${extra}` : ''})
         VALUES ($1, $2, $3, now() - make_interval(mins => $4::int)${extra ? ', now()' : ''}) RETURNING id`,
        [panel, reader.id, body, minutesAgo],
      )
    ).rows[0]!.id;

  const chapter1 = comic.chapterIds.get('1')!;
  const visible: number[] = [];
  for (let i = 1; i <= 11; i++) visible.push(await comment(await panelId(chapter1, (i % 3) + 1), `Comentario ${i}`, 100 - i)); // el 11 es el más nuevo
  await comment(await panelId(chapter1, 1), 'Oculto', 0, 'hidden_at');
  await comment(await panelId(chapter1, 1), 'Eliminado', 0, 'deleted_at');
  await comment(await panelId(comic.chapterIds.get('3:approved:retirado')!, 1), 'En un retirado', 0);
  await comment(await panelId(foreign.chapterIds.get('1')!, 1), 'En una obra ajena', 0);
  const newest = await comment(await panelId(comic.chapterIds.get('2')!, 2), '<b>Del capítulo 2</b>', 1);

  const data = await dashboard(solo);
  assert.equal(data.recentComments.length, 10);
  assert.deepEqual(
    data.recentComments.map((c) => c.body),
    ['<b>Del capítulo 2</b>', ...Array.from({ length: 9 }, (_, i) => `Comentario ${11 - i}`)],
  );
  const first = data.recentComments[0]!;
  assert.equal(first.id, newest);
  assert.deepEqual({ comic: first.comic, chapterNumber: first.chapterNumber, panelPosition: first.panelPosition }, { comic: { slug: comic.slug, title: 'Obra panel-comentarios' }, chapterNumber: 2, panelPosition: 2 });
  const { rows } = await pool.query<{ display_name: string }>('SELECT display_name FROM users WHERE id = $1', [reader.id]);
  assert.equal(first.authorName, rows[0]!.display_name);
  assert.ok(!Number.isNaN(Date.parse(first.createdAt)));
  assert.ok(!data.recentComments.some((c) => c.id === visible[0]), 'el más antiguo de los 12 visibles se queda fuera');
});
