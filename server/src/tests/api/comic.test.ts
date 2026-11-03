import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { newImageKey } from '../../utils/image.js';
import { startTestServer } from './helpers.js';
import { createComic, createUser, markRead, RUN, type TestComic, type TestUser } from './reading-fixtures.js';

// GET /api/comics/:slug (CU-02; contrato del bloque 2) contra koma_test.
process.env['STORAGE_DRIVER'] = 'local'; // portada firmada como /files/…

const srv = startTestServer();

interface ComicBody {
  comic: {
    slug: string;
    title: string;
    authorCredit: string;
    coverUrl: string | null;
    tags: unknown[];
    synopsis: string;
    publishedBy: string | null;
    license: string;
    licenseUrl: string | null;
    contentWarning: string | null;
    chapters: { number: number; title: string; publishedAt: string; access: string; read: boolean }[];
  };
}

let imported: TestComic;
let authored: TestComic;
let pendingComic: TestComic;
let withdrawnComic: TestComic;
const users = {} as Record<'reader' | 'premium' | 'admin' | 'author' | 'otherAuthor', TestUser>;

before(async () => {
  for (const kind of ['reader', 'premium', 'admin', 'author'] as const) users[kind] = await createUser(kind);
  users.otherAuthor = await createUser('author');
  imported = await createComic({
    name: 'importada',
    contentWarning: 'Violencia leve',
    coverKey: newImageKey('webp'),
    chapters: [
      { number: 1, title: 'Uno' },
      { number: 2 },
      { number: 3 },
      { number: 5 }, // los números pueden saltar
      { number: 4, status: 'pending' },
      { number: 6, status: 'draft' },
      { number: 7, status: 'rejected' },
      { number: 8, withdrawn: true },
    ],
  });
  authored = await createComic({ name: 'de-autora', authorId: users.author.id, chapters: [{ number: 1 }, { number: 3 }] });
  pendingComic = await createComic({ name: 'pendiente', status: 'pending', chapters: [{ number: 1 }] });
  withdrawnComic = await createComic({ name: 'retirada', withdrawn: true, chapters: [{ number: 1 }] });
});

async function getComic(slug: string, cookie?: string): Promise<Response> {
  return fetch(`${srv.baseUrl}/api/comics/${slug}`, cookie ? { headers: { Cookie: cookie } } : {});
}

async function comicOf(slug: string, cookie?: string): Promise<ComicBody['comic']> {
  const res = await getComic(slug, cookie);
  assert.equal(res.status, 200, slug);
  return ((await res.json()) as ComicBody).comic;
}

const accessOf = (comic: ComicBody['comic']) => Object.fromEntries(comic.chapters.map((chapter) => [chapter.number, chapter.access]));

test('Seguridad: la ficha lleva solo los campos del contrato y los capítulos públicos, por número', async () => {
  const comic = await comicOf(imported.slug);
  assert.deepEqual(Object.keys(comic).sort(), [
    'authorCredit',
    'chapters',
    'contentWarning',
    'coverUrl',
    'license',
    'licenseUrl',
    'publishedBy',
    'slug',
    'synopsis',
    'tags',
    'title',
  ]);
  assert.equal(comic.title, 'Obra importada');
  assert.equal(comic.publishedBy, null); // importada: "la plataforma" (RN-07)
  assert.equal(comic.contentWarning, 'Violencia leve'); // RN-08
  assert.match(comic.coverUrl ?? '', /^\/files\/[0-9a-f-]{36}\.webp\?exp=\d+&sig=[\w-]{43}$/);
  assert.deepEqual(
    comic.chapters.map(({ number, title }) => [number, title]),
    [
      [1, 'Uno'],
      [2, 'Capítulo 2'],
      [3, 'Capítulo 3'],
      [5, 'Capítulo 5'],
    ],
  );
  for (const chapter of comic.chapters) {
    assert.deepEqual(Object.keys(chapter).sort(), ['access', 'number', 'publishedAt', 'read', 'title']);
    assert.match(chapter.publishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  }
});

test('RN-07: una obra de autor dice quién la publicó', async () => {
  const comic = await comicOf(authored.slug);
  assert.equal(comic.publishedBy, `author ${RUN}`);
  assert.equal(comic.contentWarning, null);
  assert.equal(comic.coverUrl, null);
});

test('RN-06: la ficha responde 404 si la obra no existe o no está aprobada y 410 si se retiró', async () => {
  for (const [slug, status, code] of [
    [`no-existe-${pendingComic.slug}`, 404, 'NOT_FOUND'],
    [pendingComic.slug, 404, 'NOT_FOUND'],
    [withdrawnComic.slug, 410, 'GONE'],
    ['Mayusculas', 404, 'NOT_FOUND'],
    ['con%00nulo', 404, 'NOT_FOUND'], // no llega a la BD
    ['%E0%A4%A', 404, 'NOT_FOUND'],
  ] as const) {
    const res = await getComic(slug, users.admin.cookie); // ni el admin las ve todavía (bloque 3)
    assert.equal(res.status, status, slug);
    assert.equal(((await res.json()) as { code: string }).code, code, slug);
  }
});

test('RN-01: para el invitado, los caps. 1–2 son libres, el 3 tras un anuncio y desde el 4 hace falta cuenta', async () => {
  const comic = await comicOf(imported.slug);
  assert.deepEqual(accessOf(comic), { 1: 'free', 2: 'free', 3: 'ad', 5: 'account' });
  assert.ok(comic.chapters.every((chapter) => !chapter.read));
});

test('RN-02: el registrado gasta saldo desde el cap. 3 y lo ya leído queda libre y marcado', async () => {
  const reader = await createUser('reader');
  assert.deepEqual(accessOf(await comicOf(imported.slug, reader.cookie)), { 1: 'free', 2: 'free', 3: 'balance', 5: 'balance' });

  await markRead(reader.id, imported.chapterIds.get('3')!);
  await markRead(reader.id, imported.chapterIds.get('1')!);
  const comic = await comicOf(imported.slug, reader.cookie);
  assert.deepEqual(accessOf(comic), { 1: 'free', 2: 'free', 3: 'free', 5: 'balance' });
  assert.deepEqual(
    comic.chapters.map((chapter) => [chapter.number, chapter.read]),
    [
      [1, true],
      [2, false],
      [3, true],
      [5, false],
    ],
  );
  // Lo leído es de cada usuario.
  assert.ok((await comicOf(imported.slug, users.reader.cookie)).chapters.every((chapter) => !chapter.read));
});

test('Seguridad: premium, admin y la autora en su obra leen todo libre; en una ajena, la autora gasta saldo', async () => {
  for (const kind of ['premium', 'admin'] as const) {
    assert.deepEqual(accessOf(await comicOf(imported.slug, users[kind].cookie)), { 1: 'free', 2: 'free', 3: 'free', 5: 'free' }, kind);
  }
  assert.deepEqual(accessOf(await comicOf(authored.slug, users.author.cookie)), { 1: 'free', 3: 'free' });
  assert.deepEqual(accessOf(await comicOf(authored.slug, users.otherAuthor.cookie)), { 1: 'free', 3: 'balance' });
  assert.deepEqual(accessOf(await comicOf(imported.slug, users.author.cookie)), { 1: 'free', 2: 'free', 3: 'balance', 5: 'balance' });
});

test('Seguridad: una cookie de sesión no válida se trata como invitado', async () => {
  const comic = await comicOf(imported.slug, 'koma_session=no-es-un-jwt');
  assert.equal(accessOf(comic)[3], 'ad');
});
