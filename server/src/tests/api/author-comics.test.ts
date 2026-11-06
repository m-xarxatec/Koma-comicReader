import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createComic, createUser, RUN, type TestUser } from './reading-fixtures.js';

// Obras del autor (CU-28; RN-05, RN-07, RN-09, RN-17; contrato del bloque 3) contra koma_test.
const srv = startTestServer();

const db = async () => (await import('../../db/pool.js')).pool;

interface AuthorComicBody {
  slug: string;
  title: string;
  synopsis: string;
  authorCredit: string;
  license: string;
  licenseUrl: string | null;
  tags: { slug: string; name: string; type: string }[];
  contentWarning: string | null;
  isAdult: boolean;
  coverUrl: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  chapters: {
    number: number;
    title: string;
    status: string;
    rejectionReason: string | null;
    panelCount: number;
    publishedAt: string | null;
  }[];
}

let titles = 0;
// Entrada válida con un título propio de esta ejecución (el slug no choca con otros archivos de test).
const valid = (overrides: Record<string, unknown> = {}) => ({
  title: `Obra ${RUN} ${++titles}`,
  synopsis: 'Una sinopsis.',
  authorCredit: 'Autoría original',
  license: 'cc-by-4.0',
  tags: ['fantasia', 'magia'],
  contentWarning: null,
  isAdult: false,
  authorshipDeclared: true,
  ...overrides,
});

const create = (user: TestUser | null, body: unknown) => api(srv, 'POST', '/api/author/comics', { body, ...(user && { cookie: user.cookie }) });
const list = async (user: TestUser) => {
  const res = await api(srv, 'GET', '/api/author/comics', { cookie: user.cookie });
  assert.equal(res.status, 200);
  return ((await res.json()) as { comics: AuthorComicBody[] }).comics;
};

async function created(res: Response): Promise<AuthorComicBody> {
  assert.equal(res.status, 201, await res.clone().text());
  return ((await res.json()) as { comic: AuthorComicBody }).comic;
}

async function assertError(res: Response, status: number, code: string, field?: string) {
  assert.equal(res.status, status);
  const body = (await res.json()) as { code: string; fields?: Record<string, string> };
  assert.equal(body.code, code);
  if (field) assert.ok(body.fields?.[field], `fields.${field} en ${JSON.stringify(body.fields)}`);
  return body;
}

async function auditOf(res: Response) {
  const { findByRequestId } = await import('../../modules/audit/audit.repository.js');
  return findByRequestId(await db(), res.headers.get('x-request-id') ?? '');
}

async function stored(slug: string) {
  const { rows } = await (await db()).query<{ author_id: number; authorship_declared: boolean; status: string; license: string; is_adult: boolean }>(
    'SELECT author_id, authorship_declared, status, license, is_adult FROM comics WHERE slug = $1',
    [slug],
  );
  return rows[0];
}

const countByTitle = async (title: string) =>
  Number((await (await db()).query<{ n: string }>('SELECT count(*) AS n FROM comics WHERE title = $1', [title])).rows[0]!.n);

// ── Alta ──────────────────────────────────────────────────────────────────────

test('RN-05: el alta crea la obra en pending, del autor y con la declaración de autoría; responde 201 con AuthorComicDto', async () => {
  const author = await createUser('author');
  const input = valid({ title: `  Ñandú Épico ${RUN}  `, synopsis: 'Línea uno\r\nLínea dos  ', tags: ['magia', 'fantasia', 'magia'] });
  const comic = await created(await create(author, input));
  assert.deepEqual(Object.keys(comic).sort(), [
    'authorCredit', 'chapters', 'contentWarning', 'coverUrl', 'createdAt', 'isAdult', 'license', 'licenseUrl',
    'rejectionReason', 'slug', 'status', 'synopsis', 'tags', 'title',
  ]);
  assert.equal(comic.slug, `nandu-epico-${RUN}`);
  assert.equal(comic.title, `Ñandú Épico ${RUN}`);
  assert.equal(comic.synopsis, 'Línea uno\nLínea dos');
  assert.equal(comic.status, 'pending');
  assert.equal(comic.license, 'cc-by-4.0');
  assert.equal(comic.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/deed.es');
  assert.deepEqual(comic.tags.map((tag) => tag.slug), ['fantasia', 'magia'], 'géneros primero; los repetidos cuentan una vez');
  assert.equal(comic.coverUrl, null);
  assert.equal(comic.rejectionReason, null);
  assert.deepEqual(comic.chapters, []);
  assert.ok(!Number.isNaN(Date.parse(comic.createdAt)));
  assert.deepEqual(await stored(comic.slug), {
    author_id: author.id,
    authorship_declared: true,
    status: 'pending',
    license: 'CC BY 4.0',
    is_adult: false,
  });
});

test('RN-05: el alta audita comic.create con el slug, el título, el estado, isAdult, la licencia y las etiquetas', async () => {
  const author = await createUser('author');
  const res = await create(author, valid({ title: `Auditada ${RUN}`, tags: ['magia', 'drama'] }));
  const comic = await created(res);
  const [entry, ...rest] = await auditOf(res);
  assert.equal(rest.length, 0);
  assert.equal(entry?.action, 'comic.create');
  assert.equal(entry?.actorId, author.id);
  assert.equal(entry?.entityType, 'comics');
  assert.equal(entry?.before, null);
  assert.deepEqual(entry?.after, {
    slug: comic.slug,
    title: `Auditada ${RUN}`,
    status: 'pending',
    isAdult: false,
    license: 'cc-by-4.0',
    tags: ['drama', 'magia'],
  });
});

test('Seguridad: el alta ignora los campos que no son del contrato (estado, autor, slug, portada)', async () => {
  const author = await createUser('author');
  const other = await createUser('author');
  const comic = await created(
    await create(author, valid({ status: 'approved', authorId: other.id, slug: 'elegido', coverKey: `${'0'.repeat(36)}.png`, licenseUrl: 'javascript:alert(1)' })),
  );
  assert.equal(comic.status, 'pending');
  assert.notEqual(comic.slug, 'elegido');
  assert.equal(comic.coverUrl, null);
  assert.equal(comic.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/deed.es');
  assert.equal((await stored(comic.slug))?.author_id, author.id);
});

test('RN-07: sin la declaración de autoría (false o ausente) el alta da 400 y no crea nada', async () => {
  const author = await createUser('author');
  for (const authorshipDeclared of [false, undefined, 'true', 1]) {
    const input = valid({ authorshipDeclared });
    await assertError(await create(author, input), 400, 'VALIDATION_ERROR', 'authorshipDeclared');
    assert.equal(await countByTitle(input.title as string), 0);
  }
});

test('RN-07: la licencia es de la lista cerrada; una NC u otra cualquiera da 400 en fields.license (D6)', async () => {
  const author = await createUser('author');
  for (const license of ['cc-by-nc-4.0', 'CC BY 4.0', 'mit', '', undefined]) {
    await assertError(await create(author, valid({ license })), 400, 'VALIDATION_ERROR', 'license');
  }
  const expected = {
    'all-rights-reserved': [null, 'Todos los derechos reservados'],
    'cc-by-sa-4.0': ['https://creativecommons.org/licenses/by-sa/4.0/deed.es', 'CC BY-SA 4.0'],
    'cc0-1.0': ['https://creativecommons.org/publicdomain/zero/1.0/deed.es', 'CC0 1.0'],
  } as const;
  for (const [license, [url, name]] of Object.entries(expected)) {
    const comic = await created(await create(author, valid({ license })));
    assert.equal(comic.license, license);
    assert.equal(comic.licenseUrl, url);
    assert.equal((await stored(comic.slug))?.license, name);
  }
});

test('RN-09: el slug sale del título (sin acentos, guiones) y, si ya existe (también retirada), lleva -2, -3…', async () => {
  const author = await createUser('author');
  const title = `La Ciudad de los Ecos — ${RUN}`;
  const base = `la-ciudad-de-los-ecos-${RUN}`;
  assert.equal((await created(await create(author, valid({ title })))).slug, base);
  assert.equal((await created(await create(author, valid({ title: title.toUpperCase() })))).slug, `${base}-2`);
  // Una obra retirada conserva su URL (410): su slug sigue ocupado.
  await createComic({ name: `retirada-slug`, withdrawn: true });
  const withdrawnTitle = `c${RUN} retirada slug`;
  assert.equal((await created(await create(author, valid({ title: withdrawnTitle })))).slug, `c${RUN}-retirada-slug-2`);
  // Un título sin letras latinas ni cifras da `obra` (o `obra-N` si ya existe).
  assert.match((await created(await create(author, valid({ title: '¿¡…!?' })))).slug, /^obra(-\d+)?$/);
});

test('RN-09: dos altas a la vez con el mismo título reciben slugs distintos (se reintenta el choque)', async () => {
  const author = await createUser('author');
  const title = `Simultánea ${RUN}`;
  const results = await Promise.all([1, 2, 3].map(() => create(author, valid({ title }))));
  const slugs = await Promise.all(results.map(async (res) => (await created(res)).slug));
  assert.deepEqual([...slugs].sort(), [`simultanea-${RUN}`, `simultanea-${RUN}-2`, `simultanea-${RUN}-3`]);
});

test('RN-17: isAdult se guarda en una obra pending, pero no se puede aprobar (CHECK de la BD)', async () => {
  const author = await createUser('author');
  const comic = await created(await create(author, valid({ isAdult: true })));
  assert.equal(comic.isAdult, true);
  assert.equal(comic.status, 'pending');
  await assert.rejects(
    (await db()).query(`UPDATE comics SET status = 'approved' WHERE slug = $1`, [comic.slug]),
    (err: { constraint?: string }) => err.constraint === 'comics_adult_not_approved',
  );
  await assertError(await create(author, valid({ isAdult: 'no' })), 400, 'VALIDATION_ERROR', 'isAdult');
  await assertError(await create(author, valid({ isAdult: undefined })), 400, 'VALIDATION_ERROR', 'isAdult');
});

test('Seguridad: las etiquetas deben existir, ser de 1 a 10 e incluir al menos un género (D5), o 400 en fields.tags', async () => {
  const author = await createUser('author');
  const cases: unknown[] = [[], ['no-existe-' + RUN], ['fantasia', 'no-existe-' + RUN], ['magia', 'psicologico'], 'fantasia', [1], ['Fantasía'], undefined];
  const eleven = ['fantasia', 'aventura', 'comedia', 'drama', 'horror', 'misterio', 'romance', 'ciencia-ficcion', 'magia', 'psicologico', 'sobrenatural'];
  for (const tags of [...cases, eleven]) {
    const input = valid({ tags });
    await assertError(await create(author, input), 400, 'VALIDATION_ERROR', 'tags');
    assert.equal(await countByTitle(input.title as string), 0, JSON.stringify(tags));
  }
  const themes = await assertError(await create(author, valid({ tags: ['magia'] })), 400, 'VALIDATION_ERROR', 'tags');
  assert.equal(themes.fields?.['tags'], 'Elige al menos un género');
  // 10 etiquetas valen.
  assert.equal((await created(await create(author, valid({ tags: eleven.slice(0, 10) })))).tags.length, 10);
});

test('Seguridad: los textos siguen la regla común (D5): recortados, en puntos de código y sin caracteres de control', async () => {
  const author = await createUser('author');
  const bad: [string, unknown][] = [
    ['title', ''],
    ['title', '   '],
    ['title', 'x'.repeat(101)],
    ['title', `Con\u0000nulo ${RUN}`],
    ['title', 'Dos\nlíneas'],
    ['synopsis', ''],
    ['synopsis', 'x'.repeat(1001)],
    ['synopsis', 'Con\u0007campana'],
    ['authorCredit', ''],
    ['authorCredit', 'x'.repeat(101)],
    ['contentWarning', ''],
    ['contentWarning', 'x'.repeat(201)],
    ['contentWarning', undefined],
    ['title', 42],
  ];
  for (const [field, value] of bad) {
    await assertError(await create(author, valid({ [field]: value })), 400, 'VALIDATION_ERROR', field);
  }
  const comic = await created(
    await create(author, valid({ title: '🙂'.repeat(100), synopsis: `${'ñ'.repeat(999)}\n`, authorCredit: '  Ana  ', contentWarning: ` ${'x'.repeat(200)} ` })),
  );
  assert.equal([...comic.title].length, 100);
  assert.equal(comic.synopsis, 'ñ'.repeat(999));
  assert.equal(comic.authorCredit, 'Ana');
  assert.equal(comic.contentWarning, 'x'.repeat(200));
});

// ── Permisos y CSRF ───────────────────────────────────────────────────────────

test('Seguridad: sin sesión 401; un lector o un admin (nunca autores) 403, en el alta y en la lista', async () => {
  await assertError(await create(null, valid()), 401, 'UNAUTHENTICATED');
  await assertError(await api(srv, 'GET', '/api/author/comics'), 401, 'UNAUTHENTICATED');
  for (const kind of ['reader', 'premium', 'admin'] as const) {
    const user = await createUser(kind);
    const input = valid();
    await assertError(await create(user, input), 403, 'FORBIDDEN');
    await assertError(await api(srv, 'GET', '/api/author/comics', { cookie: user.cookie }), 403, 'FORBIDDEN');
    assert.equal(await countByTitle(input.title as string), 0);
  }
});

test('Seguridad: un autor sin sesión válida o que pierde el rol ya no crea obras', async () => {
  const author = await createUser('author');
  await (await db()).query('UPDATE users SET is_author = false WHERE id = $1', [author.id]);
  await assertError(await create(author, valid()), 403, 'FORBIDDEN');
});

test('Seguridad: el alta exige el Origin propio (CSRF)', async () => {
  const author = await createUser('author');
  const input = valid();
  const res = await fetch(`${srv.baseUrl}/api/author/comics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: author.cookie, Origin: 'https://evil.example' },
    body: JSON.stringify(input),
  });
  await assertError(res, 403, 'CSRF');
  assert.equal(await countByTitle(input.title), 0);
});

// ── Lista ─────────────────────────────────────────────────────────────────────

test('CU-28: la lista trae solo las obras del autor, sin las retiradas, de la más reciente a la más antigua', async () => {
  const author = await createUser('author');
  const other = await createUser('author');
  assert.deepEqual(await list(author), []);
  const first = await created(await create(author, valid()));
  const second = await created(await create(author, valid()));
  await created(await create(other, valid()));
  await createComic({ name: 'lista-retirada', authorId: author.id, withdrawn: true });
  const comics = await list(author);
  assert.deepEqual(comics.map((comic) => comic.slug), [second.slug, first.slug]);
});

test('CU-28: cada obra lleva sus capítulos por número, sin los retirados; los rechazados, con su motivo', async () => {
  const author = await createUser('author');
  const comic = await createComic({
    name: 'lista-capitulos',
    authorId: author.id,
    status: 'pending',
    chapters: [
      { number: 3, status: 'draft', panels: 0 },
      { number: 1, panels: 3 },
      { number: 2, status: 'rejected' },
      { number: 2, status: 'pending', panels: 1 },
      { number: 4, withdrawn: true },
    ],
  });
  await (await db()).query(`UPDATE comics SET status = 'rejected', rejection_reason = 'Falta la licencia' WHERE id = $1`, [comic.id]);
  const [listed] = await list(author);
  assert.equal(listed?.slug, comic.slug);
  assert.equal(listed?.status, 'rejected');
  assert.equal(listed?.rejectionReason, 'Falta la licencia');
  assert.equal(listed?.license, 'cc-by-4.0');
  assert.deepEqual(
    listed?.chapters.map(({ number, status, rejectionReason, panelCount }) => ({ number, status, rejectionReason, panelCount })),
    [
      { number: 1, status: 'approved', rejectionReason: null, panelCount: 3 },
      { number: 2, status: 'rejected', rejectionReason: 'Motivo', panelCount: 2 },
      { number: 2, status: 'pending', rejectionReason: null, panelCount: 1 },
      { number: 3, status: 'draft', rejectionReason: null, panelCount: 0 },
    ],
  );
  assert.ok(listed?.chapters[0]?.publishedAt && !Number.isNaN(Date.parse(listed.chapters[0].publishedAt)));
  assert.equal(listed?.chapters[3]?.publishedAt, null);
  assert.deepEqual(Object.keys(listed!.chapters[0]!).sort(), ['number', 'panelCount', 'publishedAt', 'rejectionReason', 'status', 'title']);
});
