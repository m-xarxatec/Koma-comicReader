import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, test } from 'node:test';
import type { Pool } from 'pg';
import { newImageKey } from '../../utils/image.js';
import { startTestServer } from './helpers.js';

// GET /api/tags y GET /api/comics (CU-01; contrato del bloque 2) contra koma_test. Otros archivos crean obras
// en paralelo: cada búsqueda se acota con un marcador propio (M, E, P) o con etiquetas propias.
process.env['STORAGE_DRIVER'] = 'local'; // portadas firmadas como /files/…

const srv = startTestServer();
const RUN = randomBytes(3).toString('hex');
const M = `Zq${RUN}`; // búsqueda y visibilidad
const E = `Ze${RUN}`; // comodines de ILIKE
const P = `Zp${RUN}`; // paginación
const GENRE = `g${RUN}`;
const THEME = `t${RUN}`;
const COVER = newImageKey('webp');

let pool: Pool;
let clock = 0; // created_at creciente y explícito: el orden de los resultados no depende del reloj

interface ComicFixture {
  title: string;
  authorCredit?: string;
  status?: 'approved' | 'pending' | 'rejected';
  deleted?: boolean;
  coverKey?: string | null;
  tags?: string[];
}

async function insertComic(comic: ComicFixture): Promise<string> {
  clock++;
  const slug = `c${RUN}-${clock}`;
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO comics (slug, title, synopsis, author_credit, license, status, rejection_reason, cover_key, deleted_at, created_at)
     VALUES ($1, $2, 'Sinopsis', $3, 'CC BY 4.0', $4, $5, $6, CASE WHEN $7 THEN now() END,
             '2026-01-01'::timestamptz + make_interval(secs => $8))
     RETURNING id`,
    [slug, comic.title, comic.authorCredit ?? 'Autoría', comic.status ?? 'approved', comic.status === 'rejected' ? 'Motivo' : null, comic.coverKey ?? null, comic.deleted ?? false, clock],
  );
  await pool.query('INSERT INTO comic_tags (comic_id, tag_id) SELECT $1, id FROM tags WHERE slug = ANY($2::text[])', [rows[0]!.id, comic.tags ?? []]);
  return slug;
}

const slugs: Record<string, string> = {};

before(async () => {
  ({ pool } = await import('../../db/pool.js'));
  await pool.query(`INSERT INTO tags (slug, name, type) VALUES ($1, 'Género de prueba', 'genre'), ($2, 'Temática de prueba', 'theme')`, [GENRE, THEME]);

  slugs['alfa'] = await insertComic({ title: `${M} Alfa`, authorCredit: 'Ana Pérez', coverKey: COVER, tags: [GENRE, THEME] });
  slugs['beta'] = await insertComic({ title: `${M} Beta`, authorCredit: 'Bea', tags: [GENRE] });
  slugs['gamma'] = await insertComic({ title: 'Gamma', authorCredit: `Autora ${M}`, tags: [THEME] });
  await insertComic({ title: `${M} Pendiente`, status: 'pending', tags: [GENRE] });
  await insertComic({ title: `${M} Rechazada`, status: 'rejected', tags: [GENRE] });
  await insertComic({ title: `${M} Retirada`, deleted: true, tags: [GENRE] });

  for (const suffix of ['50% off', '50x off', 'a_b', 'axb', 'c\\d', 'cd']) slugs[suffix] = await insertComic({ title: `${E} ${suffix}` });
  for (let i = 1; i <= 25; i++) slugs[`p${i}`] = await insertComic({ title: `${P} ${i}` });
});

interface CatalogBody {
  comics: { slug: string; title: string; authorCredit: string; coverUrl: string | null; tags: { slug: string; name: string; type: string }[] }[];
  page: number;
  pageSize: number;
  total: number;
}

async function catalog(query: Record<string, string>): Promise<CatalogBody> {
  const res = await fetch(`${srv.baseUrl}/api/comics?${new URLSearchParams(query)}`);
  assert.equal(res.status, 200, JSON.stringify(query));
  return (await res.json()) as CatalogBody;
}
const titles = (body: CatalogBody) => body.comics.map((comic) => comic.title);

test('Seguridad: GET /api/tags devuelve cada etiqueta con slug, nombre y tipo, los géneros primero', async () => {
  const res = await fetch(`${srv.baseUrl}/api/tags`);
  assert.equal(res.status, 200);
  const { tags } = (await res.json()) as { tags: { slug: string; name: string; type: string }[] };
  assert.deepEqual(tags.find((tag) => tag.slug === 'fantasia'), { slug: 'fantasia', name: 'Fantasía', type: 'genre' });
  assert.deepEqual(tags.find((tag) => tag.slug === THEME), { slug: THEME, name: 'Temática de prueba', type: 'theme' });
  assert.ok(tags.every((tag) => Object.keys(tag).sort().join() === 'name,slug,type'));
  const firstTheme = tags.findIndex((tag) => tag.type === 'theme');
  assert.ok(tags.slice(firstTheme).every((tag) => tag.type === 'theme'), 'los géneros van antes que las temáticas');
});

test('Seguridad: el catálogo busca en el título y en el autor, sin distinguir mayúsculas, de la más reciente a la más antigua', async () => {
  const expected = ['Gamma', `${M} Beta`, `${M} Alfa`]; // Gamma entra por el autor
  assert.deepEqual(titles(await catalog({ q: M })), expected);
  assert.deepEqual(titles(await catalog({ q: M.toLowerCase() })), expected);
  assert.deepEqual(titles(await catalog({ q: `  ${M.toUpperCase()}  ` })), expected);
  assert.deepEqual(titles(await catalog({ q: `${M} alfa` })), [`${M} Alfa`]);
});

test('Seguridad: el catálogo solo muestra obras aprobadas y no retiradas, ni por búsqueda ni por etiqueta', async () => {
  const hidden = ['Pendiente', 'Rechazada', 'Retirada'].map((word) => `${M} ${word}`);
  for (const body of [await catalog({ q: M }), await catalog({ tags: GENRE })]) {
    assert.ok(titles(body).every((title) => !hidden.includes(title)), titles(body).join(' | '));
  }
  assert.equal((await catalog({ q: `${M} Pendiente` })).total, 0);
});

test('Seguridad: cada tarjeta lleva solo los campos del contrato, con la portada firmada o null y sus etiquetas', async () => {
  const [beta, alfa] = (await catalog({ q: `${M} ` })).comics.filter((comic) => comic.title.startsWith(M));
  assert.deepEqual(Object.keys(alfa!).sort(), ['authorCredit', 'coverUrl', 'slug', 'tags', 'title']);
  assert.equal(alfa!.slug, slugs['alfa']);
  assert.equal(alfa!.authorCredit, 'Ana Pérez');
  assert.match(alfa!.coverUrl ?? '', new RegExp(`^/files/${COVER}\\?exp=\\d+&sig=[A-Za-z0-9_-]{43}$`));
  assert.deepEqual(alfa!.tags, [
    { slug: GENRE, name: 'Género de prueba', type: 'genre' },
    { slug: THEME, name: 'Temática de prueba', type: 'theme' },
  ]);
  assert.equal(beta!.coverUrl, null);
});

test('Seguridad: la búsqueda trata %, _ y \\ como texto, no como comodines, y una comilla no rompe la consulta', async () => {
  assert.deepEqual(titles(await catalog({ q: `${E} 50%` })), [`${E} 50% off`]);
  assert.deepEqual(titles(await catalog({ q: `${E} a_b` })), [`${E} a_b`]);
  assert.deepEqual(titles(await catalog({ q: `${E} c\\d` })), [`${E} c\\d`]);
  assert.equal((await catalog({ q: E })).total, 6);
  assert.equal((await catalog({ q: `${E}' OR 1=1 --` })).total, 0);
});

test('Seguridad: las etiquetas se combinan con Y; una que no existe deja la lista vacía', async () => {
  assert.deepEqual(titles(await catalog({ tags: GENRE })), [`${M} Beta`, `${M} Alfa`]);
  assert.deepEqual(titles(await catalog({ tags: THEME })), ['Gamma', `${M} Alfa`]);
  assert.deepEqual(titles(await catalog({ tags: `${GENRE},${THEME}` })), [`${M} Alfa`]);
  assert.deepEqual(titles(await catalog({ tags: `${GENRE},${GENRE}` })), [`${M} Beta`, `${M} Alfa`]);
  assert.deepEqual(await catalog({ tags: `${GENRE},no-existe-${RUN}` }), { comics: [], page: 1, pageSize: 24, total: 0 });
  assert.deepEqual(titles(await catalog({ q: 'Beta', tags: GENRE })), [`${M} Beta`]);
});

test('Seguridad: el catálogo pagina de 24 en 24 con el total de resultados', async () => {
  const first = await catalog({ q: P });
  assert.equal(first.page, 1);
  assert.equal(first.pageSize, 24);
  assert.equal(first.total, 25);
  assert.deepEqual(titles(first), Array.from({ length: 24 }, (_, i) => `${P} ${25 - i}`));
  const second = await catalog({ q: P, page: '2' });
  assert.deepEqual([second.page, second.total, titles(second)], [2, 25, [`${P} 1`]]);
  const beyond = await catalog({ q: P, page: '3' });
  assert.deepEqual([beyond.total, beyond.comics.length], [25, 0]);
  // El entero seguro más grande: 200 con la lista vacía, sin desbordar el OFFSET.
  const huge = await catalog({ q: P, page: String(Number.MAX_SAFE_INTEGER) });
  assert.deepEqual([huge.page, huge.total, huge.comics.length], [Number.MAX_SAFE_INTEGER, 25, 0]);
});

test('Seguridad: el catálogo responde 400 con el campo culpable a una búsqueda, unas etiquetas o una página no válidas', async () => {
  for (const [query, field] of [
    [`q=${'a'.repeat(101)}`, 'q'],
    [`q=a&q=b`, 'q'],
    ['q=%00', 'q'], // Seguridad: PostgreSQL rechaza el carácter nulo; sin validarlo sería un 500
    ['q=a%00b', 'q'],
    [`tags=${Array.from({ length: 11 }, (_, i) => `t${i}`).join(',')}`, 'tags'],
    [`tags=${encodeURIComponent('Fantasía')}`, 'tags'],
    ['page=0', 'page'],
    ['page=abc', 'page'],
    [`page=${Number.MAX_SAFE_INTEGER + 1}`, 'page'], // fuera de los enteros seguros
    ['page=1e400', 'page'],
  ] as const) {
    const res = await fetch(`${srv.baseUrl}/api/comics?${query}`);
    assert.equal(res.status, 400, query);
    const body = (await res.json()) as { code: string; fields?: Record<string, string> };
    assert.equal(body.code, 'VALIDATION_ERROR', query);
    assert.ok(body.fields?.[field], `${query}: fields.${field}`);
  }
  assert.equal((await fetch(`${srv.baseUrl}/api/comics?q=${'a'.repeat(100)}`)).status, 200, '100 caracteres valen');
});
