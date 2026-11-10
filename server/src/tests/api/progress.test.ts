import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createComic, createUser, markRead, type TestComic, type TestUser } from './reading-fixtures.js';

// Punto de abandono (CU-31 resto; RN-21; contrato del bloque 5): POST …/progress y el abandono del panel del autor.
const srv = startTestServer();
const db = async () => (await import('../../db/pool.js')).pool;

let author: TestUser;
let comic: TestComic; // del autor: cap. 1 con 4 viñetas, cap. 2 retirado, cap. 3 en borrador
let chapterId: number;

before(async () => {
  author = await createUser('author');
  comic = await createComic({
    name: 'progreso',
    authorId: author.id,
    chapters: [{ number: 1, panels: 4 }, { number: 2, withdrawn: true }, { number: 3, status: 'draft' }],
  });
  chapterId = comic.chapterIds.get('1')!;
});

const progressPath = (slug: string, number: number | string) => `/api/comics/${slug}/chapters/${number}/progress`;
const send = (user: TestUser | null, body: unknown, number: number | string = 1, slug = comic.slug) =>
  api(srv, 'POST', progressPath(slug, number), { body, ...(user && { cookie: user.cookie }) });
const codeOf = async (res: Response) => `${res.status} ${((await res.json()) as { code: string }).code}`;
async function lastPanel(userId: number): Promise<number | null | undefined> {
  const { rows } = await (await db()).query<{ last_panel: number | null }>('SELECT last_panel FROM chapter_reads WHERE user_id = $1 AND chapter_id = $2', [userId, chapterId]);
  return rows[0] ? rows[0].last_panel : undefined; // undefined = sin fila
}

test('Seguridad: el progreso exige sesión; un invitado recibe 401 y no se escribe nada', async () => {
  assert.equal(await codeOf(await send(null, { panel: 2 })), '401 UNAUTHENTICATED');
});

test('RN-21: sin lectura registrada, 204 sin crear la fila (el progreso nunca marca un capítulo como leído)', async () => {
  const reader = await createUser('reader');
  const res = await send(reader, { panel: 3 });
  assert.equal(res.status, 204);
  assert.equal(await lastPanel(reader.id), undefined);
});

test('RN-21: con lectura registrada guarda la viñeta máxima, y solo sube (GREATEST)', async () => {
  const reader = await createUser('reader');
  await markRead(reader.id, chapterId);
  assert.equal(await lastPanel(reader.id), null);
  assert.equal((await send(reader, { panel: 3 })).status, 204);
  assert.equal(await lastPanel(reader.id), 3);
  assert.equal((await send(reader, { panel: 1 })).status, 204);
  assert.equal(await lastPanel(reader.id), 3, 'no baja');
  assert.equal((await send(reader, { panel: 4 })).status, 204);
  assert.equal(await lastPanel(reader.id), 4);
});

test('RN-21: la viñeta se valida contra el capítulo: 400 en fields.panel si no existe o no es un entero ≥ 1', async () => {
  const reader = await createUser('reader');
  await markRead(reader.id, chapterId);
  for (const body of [{ panel: 5 }, { panel: 0 }, { panel: -1 }, { panel: 1.5 }, { panel: '2' }, {}]) {
    const res = await send(reader, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    const error = (await res.json()) as { code: string; fields?: Record<string, string> };
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.ok(error.fields?.panel, JSON.stringify(body));
  }
  assert.equal(await lastPanel(reader.id), null, 'nada escrito');
});

test('RN-21: solo capítulos públicos: 404 si no existe o no está publicado, 410 si se retiró', async () => {
  const reader = await createUser('reader');
  assert.equal(await codeOf(await send(reader, { panel: 1 }, 99)), '404 NOT_FOUND');
  assert.equal(await codeOf(await send(reader, { panel: 1 }, 3)), '404 NOT_FOUND'); // borrador
  assert.equal(await codeOf(await send(reader, { panel: 1 }, 1, 'no-existe-esta-obra')), '404 NOT_FOUND');
  assert.equal(await codeOf(await send(reader, { panel: 1 }, 2)), '410 GONE');
});

test('RN-13: el progreso admite 60 envíos por minuto y usuario; el 61 recibe 429', async () => {
  const reader = await createUser('reader');
  await markRead(reader.id, chapterId);
  for (let i = 0; i < 60; i++) assert.equal((await send(reader, { panel: 1 })).status, 204, `envío ${i + 1}`);
  assert.equal(await codeOf(await send(reader, { panel: 1 })), '429 RATE_LIMITED');
  const other = await createUser('reader'); // el límite es por usuario
  assert.equal((await send(other, { panel: 1 })).status, 204);
});

test('RN-21: el panel del autor da, por capítulo, lectores que llegan al final y viñeta de más abandono, sin admin, dueño ni NULL', async () => {
  const owner = await createUser('author');
  const own = await createComic({ name: 'abandono', authorId: owner.id, chapters: [{ number: 1, panels: 4 }, { number: 2, panels: 3 }] });
  const ch1 = own.chapterIds.get('1')!;
  const pool = await db();
  const read = async (userId: number, lastPanelValue: number | null) => {
    await markRead(userId, ch1);
    if (lastPanelValue !== null) await pool.query('UPDATE chapter_reads SET last_panel = $3 WHERE user_id = $1 AND chapter_id = $2', [userId, ch1, lastPanelValue]);
  };
  for (const value of [4, 4, 2, 2, 3, null]) await read((await createUser('reader')).id, value);
  await read((await createUser('admin')).id, 1); // admin: fuera
  await read(owner.id, 1); // autor dueño: fuera

  const res = await api(srv, 'GET', '/api/author/dashboard', { cookie: owner.cookie });
  assert.equal(res.status, 200);
  const { dashboard } = (await res.json()) as {
    dashboard: { works: { slug: string; chapters: { number: number; abandonment: Record<string, number | null> }[] }[] };
  };
  const chapters = dashboard.works.find((work) => work.slug === own.slug)!.chapters;
  assert.deepEqual(chapters.find((chapter) => chapter.number === 1)!.abandonment, {
    panels: 4,
    readersWithData: 5,
    reachedEnd: 2,
    reachedEndPct: 40,
    dropPanel: 2,
    dropReaders: 2,
  });
  assert.deepEqual(chapters.find((chapter) => chapter.number === 2)!.abandonment, {
    panels: 3,
    readersWithData: 0,
    reachedEnd: 0,
    reachedEndPct: 0,
    dropPanel: null,
    dropReaders: 0,
  });
});
