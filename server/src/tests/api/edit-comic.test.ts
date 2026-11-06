import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createComic, createUser, RUN, type TestComic, type TestUser } from './reading-fixtures.js';

// Editar obra (CU-30, recortable; RN-05, RN-09, D8, D14; contrato del bloque 3) contra koma_test.
const srv = startTestServer();

const db = async () => (await import('../../db/pool.js')).pool;

interface AuthorComicBody {
  slug: string;
  title: string;
  synopsis: string;
  authorCredit: string;
  license: string;
  licenseUrl: string | null;
  tags: { slug: string }[];
  contentWarning: string | null;
  isAdult: boolean;
  status: string;
}

const patch = (slug: string, user: TestUser | null, body: unknown) =>
  api(srv, 'PATCH', `/api/author/comics/${slug}`, { body, ...(user && { cookie: user.cookie }) });

async function ok(res: Response): Promise<AuthorComicBody> {
  assert.equal(res.status, 200, await res.clone().text());
  return ((await res.json()) as { comic: AuthorComicBody }).comic;
}

async function assertError(res: Response, status: number, code: string, field?: string) {
  assert.equal(res.status, status, await res.clone().text());
  const body = (await res.json()) as { code: string; fields?: Record<string, string> };
  assert.equal(body.code, code);
  if (field) assert.ok(body.fields?.[field], `fields.${field} en ${JSON.stringify(body.fields)}`);
  return body;
}

async function auditOf(res: Response) {
  const { findByRequestId } = await import('../../modules/audit/audit.repository.js');
  return findByRequestId(await db(), res.headers.get('x-request-id') ?? '');
}

let comics = 0;
// Obra del autor con dos etiquetas (fantasia, magia) y un capítulo publicado.
async function ownComic(status: 'pending' | 'approved' = 'pending'): Promise<{ author: TestUser; comic: TestComic }> {
  const author = await createUser('author');
  const comic = await createComic({ name: `editar-${++comics}`, authorId: author.id, status, chapters: [{ number: 1 }] });
  await (await db()).query(
    `INSERT INTO comic_tags (comic_id, tag_id) SELECT $1, id FROM tags WHERE slug = ANY($2::text[])`,
    [comic.id, ['fantasia', 'magia']],
  );
  return { author, comic };
}

test('CU-30: editar guarda solo lo que cambia, no cambia el slug y audita comic.update con esos campos antes y después', async () => {
  const { author, comic } = await ownComic();
  const res = await patch(comic.slug, author, {
    title: `  Título nuevo ${RUN}  `,
    synopsis: 'Sinopsis de prueba', // igual que la actual: no cuenta como cambio
    license: 'cc0-1.0',
    tags: ['drama', 'magia'],
    contentWarning: 'Violencia',
    authorshipDeclared: false, // no es editable: se ignora
  });
  const updated = await ok(res);
  assert.equal(updated.slug, comic.slug, 'RN-09: el slug no cambia aunque cambie el título');
  assert.equal(updated.title, `Título nuevo ${RUN}`);
  assert.equal(updated.license, 'cc0-1.0');
  assert.equal(updated.licenseUrl, 'https://creativecommons.org/publicdomain/zero/1.0/deed.es');
  assert.deepEqual(updated.tags.map((tag) => tag.slug), ['drama', 'magia']);
  assert.equal(updated.contentWarning, 'Violencia');
  assert.equal(updated.status, 'pending', 'sin reaprobación ni cambio de estado (RN-05)');

  const [entry, ...rest] = await auditOf(res);
  assert.equal(rest.length, 0);
  assert.equal(entry?.action, 'comic.update');
  assert.equal(entry?.actorId, author.id);
  assert.equal(entry?.entityId, String(comic.id));
  assert.deepEqual(entry?.before, { title: `Obra editar-${comics}`, contentWarning: null, license: 'cc-by-4.0', tags: ['fantasia', 'magia'] });
  assert.deepEqual(entry?.after, { title: `Título nuevo ${RUN}`, contentWarning: 'Violencia', license: 'cc0-1.0', tags: ['drama', 'magia'] });
  const { rows } = await (await db()).query<{ authorship_declared: boolean; license: string }>('SELECT authorship_declared, license FROM comics WHERE id = $1', [comic.id]);
  assert.deepEqual(rows[0], { authorship_declared: true, license: 'CC0 1.0' });
});

test('CU-30: sin cambios (o con un cuerpo vacío) responde 200 sin escribir en la auditoría', async () => {
  const { author, comic } = await ownComic();
  for (const body of [{}, { title: `Obra editar-${comics}`, tags: ['magia', 'fantasia'], license: 'cc-by-4.0', contentWarning: null }]) {
    const res = await patch(comic.slug, author, body);
    await ok(res);
    assert.deepEqual(await auditOf(res), [], JSON.stringify(body));
  }
});

test('D14: isAdult solo cambia mientras la obra no está aprobada; en una publicada, 400 en fields.isAdult', async () => {
  const pending = await ownComic('pending');
  const res = await patch(pending.comic.slug, pending.author, { isAdult: true });
  assert.equal((await ok(res)).isAdult, true);
  assert.deepEqual((await auditOf(res))[0]?.after, { isAdult: true });

  const approved = await ownComic('approved');
  await assertError(await patch(approved.comic.slug, approved.author, { isAdult: true }), 400, 'VALIDATION_ERROR', 'isAdult');
  // El mismo valor que ya tiene no es un cambio: vale.
  await ok(await patch(approved.comic.slug, approved.author, { isAdult: false, title: `Publicada ${RUN}` }));
});

test('RN-05: editar una obra publicada no la devuelve a revisión', async () => {
  const { author, comic } = await ownComic('approved');
  const updated = await ok(await patch(comic.slug, author, { synopsis: 'Otra sinopsis\r\ncon dos líneas' }));
  assert.equal(updated.status, 'approved');
  assert.equal(updated.synopsis, 'Otra sinopsis\ncon dos líneas');
  assert.equal((await api(srv, 'GET', `/api/comics/${comic.slug}`)).status, 200);
});

test('Seguridad: los campos editables se validan como en el alta (textos, licencia NC, etiquetas y género)', async () => {
  const { author, comic } = await ownComic();
  for (const [field, value] of [
    ['title', ''],
    ['title', 'x'.repeat(101)],
    ['synopsis', 'Con\u0007campana'],
    ['authorCredit', '   '],
    ['license', 'cc-by-nc-4.0'],
    ['contentWarning', ''],
    ['isAdult', 'sí'],
    ['tags', []],
    ['tags', ['no-existe-' + RUN]],
    ['tags', ['magia']],
  ] as const) {
    await assertError(await patch(comic.slug, author, { [field]: value }), 400, 'VALIDATION_ERROR', field);
  }
  assert.deepEqual((await (await db()).query<{ title: string }>('SELECT title FROM comics WHERE id = $1', [comic.id])).rows[0]?.title, `Obra editar-${comics}`);
});

test('Seguridad: obra ajena 403, inexistente 404, rechazada 409 (D8) y retirada 410; sin sesión 401 y un lector 403', async () => {
  const { author, comic } = await ownComic();
  await assertError(await patch(comic.slug, await createUser('author'), { title: 'Ajena' }), 403, 'FORBIDDEN');
  await assertError(await patch(comic.slug, await createUser('admin'), { title: 'Admin' }), 403, 'FORBIDDEN');
  await assertError(await patch(comic.slug, await createUser('reader'), { title: 'Lector' }), 403, 'FORBIDDEN');
  await assertError(await patch(comic.slug, null, { title: 'Invitado' }), 401, 'UNAUTHENTICATED');
  await assertError(await patch(`no-existe-${RUN}`, author, { title: 'Nada' }), 404, 'NOT_FOUND');

  const rejected = await ownComic();
  await (await db()).query(`UPDATE comics SET status = 'rejected', rejection_reason = 'Motivo' WHERE id = $1`, [rejected.comic.id]);
  await assertError(await patch(rejected.comic.slug, rejected.author, { title: 'Rechazada' }), 409, 'CONFLICT');

  const withdrawn = await ownComic();
  await (await db()).query('UPDATE comics SET deleted_at = now() WHERE id = $1', [withdrawn.comic.id]);
  await assertError(await patch(withdrawn.comic.slug, withdrawn.author, { title: 'Retirada' }), 410, 'GONE');
});

test('Seguridad: editar exige el Origin propio (CSRF)', async () => {
  const { author, comic } = await ownComic();
  const res = await fetch(`${srv.baseUrl}/api/author/comics/${comic.slug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: author.cookie },
    body: JSON.stringify({ title: 'Sin Origin' }),
  });
  await assertError(res, 403, 'CSRF');
});
