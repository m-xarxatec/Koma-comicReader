import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, test } from 'node:test';
import type { PoolClient } from 'pg';
import type { AdminStatsDto } from '../../modules/admin/admin.rules.js';
import { api, startTestServer } from './helpers.js';
import { createComic, createUser, RUN, type TestComic, type TestUser } from './reading-fixtures.js';

// Estadísticas globales (CU-39; RN-20; contrato del bloque 5). Las cifras son de toda la plataforma y los archivos de
// test corren en paralelo sobre koma_test, así que no se comparan valores absolutos: cada test abre una transacción
// REPEATABLE READ, lee las estadísticas (la instantánea queda fijada), escribe sus datos, las vuelve a leer y compara
// la diferencia, que solo puede ser suya. Al terminar, ROLLBACK: no deja nada.
const srv = startTestServer();
const db = async () => (await import('../../db/pool.js')).pool;
const stats = async (client: PoolClient) => (await import('../../modules/admin/admin.service.js')).getPlatformStats(client);

async function inSnapshot(run: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await (await db()).connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await run(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

// Instante de Madrid: el comienzo del día de hoy − `days`, más `seconds` (negativo = antes de ese comienzo).
const madridDayStart = (days: number, seconds = 0) =>
  `((((now() AT TIME ZONE 'Europe/Madrid')::date - ${days})::timestamp AT TIME ZONE 'Europe/Madrid') + make_interval(secs => ${seconds}))`;
const madridDay = (days: number) => `((now() AT TIME ZONE 'Europe/Madrid')::date - ${days})`;

let n = 0;
async function insertUser(client: PoolClient, fields: { role?: 'user' | 'admin'; isAuthor?: boolean; status?: 'active' | 'suspended'; premium?: boolean } = {}) {
  n++;
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, display_name, role, is_author, status, premium_until)
     VALUES ($1, 'sin-uso', $2, $3, $4, $5, CASE WHEN $6::boolean THEN now() + interval '30 days' END) RETURNING id`,
    [`stats-${RUN}-${n}@lectura.test`, `stats ${RUN}`, fields.role ?? 'user', fields.isAuthor ?? false, fields.status ?? 'active', fields.premium ?? false],
  );
  return rows[0]!.id;
}

let admin: TestUser;
let reader: TestUser;
let author: TestUser;
let comic: TestComic; // panelKeys → ids de viñetas se leen en cada test
const comics: Record<string, TestComic> = {};

before(async () => {
  [admin, reader, author] = await Promise.all([createUser('admin'), createUser('reader'), createUser('author')]);
  comic = await createComic({ name: 'stats', chapters: [{ number: 1, panels: 3 }] });
  // Obras más leídas: D y A/B empatan en 30 días (D gana por total; A y B empatan en todo y decide el slug); C tiene
  // más total pero menos en 30 días; W está retirada y A tiene además un capítulo retirado con muchas lecturas.
  for (const name of ['top-a', 'top-b', 'top-c', 'top-d']) {
    comics[name] = await createComic({ name, chapters: name === 'top-a' ? [{ number: 1 }, { number: 2, withdrawn: true }] : [{ number: 1 }] });
  }
  comics['top-w'] = await createComic({ name: 'top-w', withdrawn: true, chapters: [{ number: 1 }] });
});

test('Seguridad: las estadísticas solo las ve el admin, sin caché y sin correos ni nombres', async () => {
  const codeOf = async (res: Response) => `${res.status} ${((await res.json()) as { code: string }).code}`;
  assert.equal(await codeOf(await api(srv, 'GET', '/api/admin/stats')), '401 UNAUTHENTICATED');
  assert.equal(await codeOf(await api(srv, 'GET', '/api/admin/stats', { cookie: reader.cookie })), '403 FORBIDDEN');
  assert.equal(await codeOf(await api(srv, 'GET', '/api/admin/stats', { cookie: author.cookie })), '403 FORBIDDEN');

  const res = await api(srv, 'GET', '/api/admin/stats', { cookie: admin.cookie });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const text = await res.text();
  assert.ok(!/@(lectura|demo)\.test/.test(text), 'ningún correo');
  assert.ok(!text.includes(`admin ${RUN}`) && !text.includes(`reader ${RUN}`), 'ningún nombre visible');
  const { stats: body } = JSON.parse(text) as { stats: AdminStatsDto };
  assert.match(body.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(body).sort(), ['auditLast24h', 'catalog', 'comments', 'reads', 'today', 'topComics', 'users']);
  assert.equal(body.users.readers + body.users.authors + body.users.admins + body.users.suspended, body.users.total);
  assert.equal(body.reads.total, body.reads.guests.total + body.reads.users.total);
  assert.ok(body.topComics.length <= 5);
});

test('RN-20: cuentas activas por rol, suspendidas aparte (suman el total), premium sin admins ni suspendidas', async () => {
  await inSnapshot(async (client) => {
    const start = await stats(client);
    await insertUser(client); // lector
    await insertUser(client, { premium: true }); // lector premium
    await insertUser(client, { isAuthor: true, premium: true }); // autor premium
    await insertUser(client, { role: 'admin', premium: true }); // admin: no cuenta como premium
    await insertUser(client, { status: 'suspended', premium: true }); // suspendido: no cuenta como premium
    await insertUser(client, { status: 'suspended', isAuthor: true });
    const end = await stats(client);
    assert.deepEqual(
      {
        total: end.users.total - start.users.total,
        readers: end.users.readers - start.users.readers,
        authors: end.users.authors - start.users.authors,
        admins: end.users.admins - start.users.admins,
        suspended: end.users.suspended - start.users.suspended,
        premium: end.users.premium - start.users.premium,
      },
      { total: 6, readers: 2, authors: 1, admins: 1, suspended: 2, premium: 2 },
    );
  });
});

test('RN-20: usuarios activos = cuentas activas no admin con alguna lectura en los últimos 30 días de Madrid', async () => {
  await inSnapshot(async (client) => {
    const chapterId = comic.chapterIds.get('1')!;
    const start = await stats(client);
    const read = async (userId: number, at: string) =>
      client.query(`INSERT INTO chapter_reads (user_id, chapter_id, first_read_at, last_read_at) VALUES ($1, $2, ${at}, ${at})`, [userId, chapterId]);
    await read(await insertUser(client), madridDayStart(29)); // primer instante del día 30: cuenta
    await read(await insertUser(client), madridDayStart(29, -1)); // un segundo antes: no
    await read(await insertUser(client), 'now()'); // hoy: cuenta
    await read(await insertUser(client, { role: 'admin' }), 'now()'); // admin: no
    await read(await insertUser(client, { status: 'suspended' }), 'now()'); // suspendido: no
    await insertUser(client); // sin lecturas: no
    const end = await stats(client);
    assert.equal(end.users.activeLast30 - start.users.activeLast30, 2);
  });
});

test('RN-20: comentarios de 7 días (en cualquier estado) y moderados distintos (ocultar y eliminar cuentan una vez)', async () => {
  await inSnapshot(async (client) => {
    const { rows: panels } = await client.query<{ id: number }>('SELECT id FROM panels WHERE chapter_id = $1 ORDER BY position', [comic.chapterIds.get('1')]);
    const panelId = panels[0]!.id;
    const comment = async (at: string, state = '') => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO comments (panel_id, user_id, body, created_at, hidden_at, deleted_at)
         VALUES ($1, $2, 'Comentario de estadísticas', ${at}, ${state === 'hidden' ? 'now()' : 'NULL'}, ${state === 'deleted' ? 'now()' : 'NULL'})
         RETURNING id`,
        [panelId, reader.id],
      );
      return String(rows[0]!.id);
    };
    const audit = (action: string, entityId: string, at = 'now()') =>
      client.query(`INSERT INTO audit_log (actor_id, action, entity_type, entity_id, request_id, created_at) VALUES ($1, $2, 'comments', $3, $4, ${at})`, [
        admin.id,
        action,
        entityId,
        randomUUID(),
      ]);

    const start = await stats(client);
    const first = await comment(madridDayStart(6)); // primer instante del día 7: cuenta
    await comment(madridDayStart(6, -1)); // un segundo antes: no
    const hidden = await comment('now()', 'hidden'); // oculto: cuenta (mide actividad)
    const own = await comment('now()', 'deleted'); // borrado por su autor: cuenta
    // Moderación: `first` se oculta y después se elimina (1), `hidden` se oculta (1), `own` es delete_own (0) y una
    // moderación de hace 7 días de Madrid queda fuera.
    await audit('comment.hide', first);
    await audit('comment.delete', first);
    await audit('comment.hide', hidden);
    await audit('comment.delete_own', own);
    await audit('comment.hide', `${RUN}-viejo`, madridDayStart(6, -1));
    const end = await stats(client);
    assert.equal(end.comments.last7 - start.comments.last7, 3);
    assert.equal(end.comments.moderatedLast7 - start.comments.moderatedLast7, 2);
  });
});

test('RN-20: eventos recientes = entradas de la auditoría de las últimas 24 h (ventana móvil, no días)', async () => {
  await inSnapshot(async (client) => {
    const start = await stats(client);
    const entry = (at: string) =>
      client.query(`INSERT INTO audit_log (actor_id, action, entity_type, request_id, created_at) VALUES (NULL, 'system.seed', 'settings', $1, ${at})`, [randomUUID()]);
    await entry('now()');
    await entry("now() - interval '23 hours 59 minutes'");
    await entry("now() - interval '24 hours 1 minute'"); // fuera
    const end = await stats(client);
    assert.equal(end.auditLast24h - start.auditLast24h, 2);
  });
});

test('RN-20: catálogo = obras approved sin retirar y sus capítulos approved sin retirar', async () => {
  await inSnapshot(async (client) => {
    const start = await stats(client);
    const insertComic = async (name: string, status: string, withdrawn: boolean) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO comics (slug, title, synopsis, author_id, authorship_declared, author_credit, license, license_url, status, deleted_at)
         VALUES ($1, 'Obra', 'Sinopsis', NULL, false, 'Autoría', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/', $2, CASE WHEN $3::boolean THEN now() END)
         RETURNING id`,
        [`c${RUN}-cat-${name}`, status, withdrawn],
      );
      return rows[0]!.id;
    };
    const chapter = (comicId: number, number: number, status: string, withdrawn = false) =>
      client.query(
        `INSERT INTO chapters (comic_id, number, title, status, published_at, deleted_at)
         VALUES ($1, $2, 'Capítulo', $3::text, CASE WHEN $3::text = 'approved' THEN now() END, CASE WHEN $4::boolean THEN now() END)`,
        [comicId, number, status, withdrawn],
      );
    const live = await insertComic('viva', 'approved', false);
    await chapter(live, 1, 'approved');
    await chapter(live, 2, 'approved');
    await chapter(live, 3, 'approved', true); // retirado: no
    await chapter(live, 4, 'pending'); // pendiente: no
    const pending = await insertComic('pendiente', 'pending', false);
    await chapter(pending, 1, 'approved'); // su obra no está publicada: no
    const gone = await insertComic('retirada', 'approved', true);
    await chapter(gone, 1, 'approved'); // obra retirada: no
    const end = await stats(client);
    assert.deepEqual({ comics: end.catalog.comics - start.catalog.comics, chapters: end.catalog.chapters - start.catalog.chapters }, { comics: 1, chapters: 2 });
  });
});

test('RN-20: lecturas por ventanas de días de Madrid y obras más leídas (30 días, total y slug), sin retirados', async () => {
  await inSnapshot(async (client) => {
    const start = await stats(client);
    // Cifras muy por encima de cualquier otra obra de koma_test: estas cinco ocupan el top.
    const reads = (key: string, chapter: string, daysAgo: number, guests: number, users: number) =>
      client.query(`INSERT INTO chapter_read_counts (chapter_id, day, guest_reads, user_reads) VALUES ($1, ${madridDay(daysAgo)}, $2, $3)`, [
        comics[key]!.chapterIds.get(chapter),
        guests,
        users,
      ]);
    // A: hoy 3+1, hace 6 días 1+1 (entran en 7), hace 7 días 2+0 (fuera de 7, dentro de 30), hace 29 1+0 (dentro de 30),
    // hace 30 5+5 (fuera de 30). Su capítulo retirado no cuenta.
    await reads('top-a', '1', 0, 3_000_000, 1_000_000);
    await reads('top-a', '1', 6, 1_000_000, 1_000_000);
    await reads('top-a', '1', 7, 2_000_000, 0);
    await reads('top-a', '1', 29, 1_000_000, 0);
    await reads('top-a', '1', 30, 5_000_000, 5_000_000);
    await reads('top-a', '2:approved:retirado', 0, 90_000_000, 0);
    // B: lo mismo que A en 30 días y en total, repartido de otra forma.
    await reads('top-b', '1', 0, 9_000_000, 0);
    await reads('top-b', '1', 40, 10_000_000, 0);
    // C: más total que A, menos en 30 días. D: lo mismo que A en 30 días, más total.
    await reads('top-c', '1', 0, 8_000_000, 0);
    await reads('top-c', '1', 60, 50_000_000, 0);
    await reads('top-d', '1', 1, 9_000_000, 0);
    await reads('top-d', '1', 50, 20_000_000, 0);
    // W: obra retirada, no cuenta en nada.
    await reads('top-w', '1', 0, 99_000_000, 0);
    const end = await stats(client);

    const M = 1_000_000;
    const delta = (a: { total: number; last7: number; last30: number }, b: { total: number; last7: number; last30: number }) => ({
      total: a.total - b.total,
      last7: a.last7 - b.last7,
      last30: a.last30 - b.last30,
    });
    assert.deepEqual(delta(end.reads.guests, start.reads.guests), { total: 118 * M, last7: 30 * M, last30: 33 * M });
    assert.deepEqual(delta(end.reads.users, start.reads.users), { total: 7 * M, last7: 2 * M, last30: 2 * M });
    assert.deepEqual(delta(end.reads, start.reads), { total: 125 * M, last7: 32 * M, last30: 35 * M });

    assert.deepEqual(
      end.topComics.slice(0, 4).map((top) => ({ slug: top.slug, reads: top.reads })),
      [
        { slug: comics['top-d']!.slug, reads: { total: 29 * M, last7: 9 * M, last30: 9 * M } },
        { slug: comics['top-a']!.slug, reads: { total: 19 * M, last7: 6 * M, last30: 9 * M } },
        { slug: comics['top-b']!.slug, reads: { total: 19 * M, last7: 9 * M, last30: 9 * M } },
        { slug: comics['top-c']!.slug, reads: { total: 58 * M, last7: 8 * M, last30: 8 * M } },
      ],
    );
    assert.ok(!end.topComics.some((top) => top.slug === comics['top-w']!.slug), 'la obra retirada no sale');
    assert.ok(end.topComics.length <= 5);
  });
});
