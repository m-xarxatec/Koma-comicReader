import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import type { Pool } from 'pg';
import { startTestServer } from './helpers.js';
import { createComic, createUser, type TestComic, type TestUser } from './reading-fixtures.js';

// POST /api/comics/:slug/chapters/:number/read, parte 2 (T11b: RN-02, RN-03 y estadísticas; contrato del
// bloque 2) contra koma_test. Los parámetros de settings son los del seed y no se cambian aquí (otros
// archivos corren en paralelo): el paso del tiempo se simula moviendo period_started_at de cada usuario.
process.env['STORAGE_DRIVER'] = 'local';

const srv = startTestServer();

interface Reading {
  chapter: { number: number };
  ads: { interstitial: unknown; end: { brand: string; body: string; imageUrl: string | null } | null };
  balance: { balance: number; max: number; retryAt: string | null } | null;
}

let pool: Pool;
let settings: { max: number; refill: number; waitMinutes: number };
let comic: TestComic;
let stats: TestComic;
let race: TestComic;

before(async () => {
  ({ pool } = await import('../../db/pool.js'));
  const { rows } = await pool.query<{ key: string; value: number }>(`SELECT key, value FROM settings WHERE key LIKE 'reading.%'`);
  const value = (key: string) => rows.find((row) => row.key === key)!.value;
  settings = { max: value('reading.max_balance'), refill: value('reading.refill'), waitMinutes: value('reading.wait_minutes') };
  comic = await createComic({ name: 'saldo', chapters: [1, 2, 3, 4, 5, 6, 7, 8].map((number) => ({ number })) });
  race = await createComic({ name: 'carrera', chapters: Array.from({ length: 22 }, (_, i) => ({ number: i + 1, panels: 1 })) });
  stats = await createComic({ name: 'estadisticas', chapters: [{ number: 1 }, { number: 3 }] });
});

function read(slug: string, number: number, cookie?: string): Promise<Response> {
  return fetch(`${srv.baseUrl}/api/comics/${slug}/chapters/${number}/read`, {
    method: 'POST',
    headers: { Origin: srv.origin, ...(cookie && { Cookie: cookie }) },
  });
}

async function readOk(slug: string, number: number, cookie?: string): Promise<Reading> {
  const res = await read(slug, number, cookie);
  assert.equal(res.status, 200, `${slug} cap. ${number}: ${res.status} ${res.status === 200 ? '' : await res.clone().text()}`);
  return ((await res.json()) as { reading: Reading }).reading;
}

async function credits(userId: number) {
  const { rows } = await pool.query<{ balance: number; period_started_at: Date | null; reads_since_ad: number }>(
    'SELECT balance, period_started_at, reads_since_ad FROM reading_credits WHERE user_id = $1',
    [userId],
  );
  return rows[0] ?? null;
}

// Saldo guardado a mano: `secondsAgo` es cuánto hace que empezó el periodo de espera.
async function setCredits(user: TestUser, balance: number, secondsAgo: number): Promise<void> {
  await pool.query(
    `INSERT INTO reading_credits (user_id, balance, period_started_at) VALUES ($1, $2, now() - make_interval(secs => $3))
     ON CONFLICT (user_id) DO UPDATE SET balance = $2, period_started_at = now() - make_interval(secs => $3)`,
    [user.id, balance, secondsAgo],
  );
}

const readRows = async (userId: number) =>
  (await pool.query<{ number: number }>('SELECT c.number FROM chapter_reads r JOIN chapters c ON c.id = r.chapter_id WHERE r.user_id = $1 ORDER BY c.number', [userId])).rows.map(
    (row) => row.number,
  );

const near = (iso: string | null, expectedMs: number, label: string) => {
  assert.ok(iso, `${label}: retryAt`);
  assert.ok(Math.abs(Date.parse(iso) - expectedMs) < 5000, `${label}: ${iso}`);
};

test('RN-02: los caps. 1–2 no gastan saldo, pero la primera lectura crea la fila llena (D1) y cuenta para RN-03', async () => {
  const reader = await createUser('reader');
  assert.equal(await credits(reader.id), null);
  const reading = await readOk(comic.slug, 1, reader.cookie);
  assert.deepEqual(reading.balance, { balance: settings.max, max: settings.max, retryAt: null });
  assert.deepEqual(await credits(reader.id), { balance: settings.max, period_started_at: null, reads_since_ad: 1 });
  await readOk(comic.slug, 1, reader.cookie); // relectura: no cuenta
  await readOk(comic.slug, 2, reader.cookie);
  assert.equal((await credits(reader.id))?.reads_since_ad, 2);
  assert.deepEqual(await readRows(reader.id), [1, 2]);
});

test('RN-02: la primera lectura de un capítulo de pago gasta 1 y abre el periodo; releerlo no gasta', async () => {
  const reader = await createUser('reader');
  const before = Date.now();
  const first = await readOk(comic.slug, 3, reader.cookie);
  assert.equal(first.balance?.balance, settings.max - 1);
  near(first.balance!.retryAt, before + settings.waitMinutes * 60_000, 'primer consumo');
  const again = await readOk(comic.slug, 3, reader.cookie); // "Recargar" (CU-03)
  assert.deepEqual(again.balance, first.balance);
  const second = await readOk(comic.slug, 4, reader.cookie);
  assert.equal(second.balance?.balance, settings.max - 2);
  assert.equal(second.balance?.retryAt, first.balance?.retryAt, 'el periodo no se reinicia');
  const stored = await credits(reader.id);
  assert.equal(stored?.balance, settings.max - 2);
  assert.equal(stored?.reads_since_ad, 2);
  assert.deepEqual(await readRows(reader.id), [3, 4]);
});

test('RN-02: sin saldo, 403 READING_LIMIT con retryAt y sin ningún efecto', async () => {
  const reader = await createUser('reader');
  await setCredits(reader, 0, 10);
  const res = await read(comic.slug, 5, reader.cookie);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; retryAt?: string; requestId: string };
  assert.equal(body.code, 'READING_LIMIT');
  near(body.retryAt ?? null, Date.now() - 10_000 + settings.waitMinutes * 60_000, 'sin saldo');
  assert.deepEqual(await readRows(reader.id), []);
  assert.equal((await credits(reader.id))?.reads_since_ad, 0);
  // Lo ya leído y los caps. 1–2 se siguen leyendo sin saldo.
  await readOk(comic.slug, 1, reader.cookie);
  assert.equal((await readOk(comic.slug, 2, reader.cookie)).balance?.balance, 0);
});

test('RN-02: pasado un periodo de espera se recarga y se puede volver a leer', async () => {
  const reader = await createUser('reader');
  const wait = settings.waitMinutes * 60;
  await setCredits(reader, 0, wait + 2); // un periodo y 2 s
  const reading = await readOk(comic.slug, 6, reader.cookie);
  const refilled = Math.min(settings.max, settings.refill);
  assert.equal(reading.balance?.balance, refilled - 1);
  // El siguiente periodo empezó al recargar (hace 2 s), así que la próxima recarga es dentro de wait − 2 s.
  if (refilled < settings.max) near(reading.balance!.retryAt, Date.now() - 2000 + wait * 1000, 'tras recargar');
  const stored = await credits(reader.id);
  assert.equal(stored?.balance, refilled - 1);
});

test('RN-02: lecturas simultáneas de capítulos distintos con saldo 1: solo una se lee, las demás salen 403', async () => {
  const reader = await createUser('reader');
  await setCredits(reader, 1, 1);
  const chapters = Array.from({ length: 20 }, (_, i) => i + 3); // caps. 3–22, todos de pago
  const statuses = (await Promise.all(chapters.map((number) => read(race.slug, number, reader.cookie)))).map((res) => res.status);
  assert.deepEqual(
    statuses.filter((status) => status === 200),
    [200],
    statuses.join(','),
  );
  assert.equal(statuses.filter((status) => status === 403).length, chapters.length - 1);
  assert.equal((await credits(reader.id))?.balance, 0);
  assert.equal((await readRows(reader.id)).length, 1);
});

// Determinista, a diferencia del anterior: dos peticiones HTTP pueden no solaparse en el instante justo.
test('RN-02: la fila de saldo queda bloqueada hasta el final de la transacción: una segunda lectura espera', async () => {
  const reader = await createUser('reader');
  await setCredits(reader, 1, 1); // fila ya existente: el INSERT no espera y el bloqueo es el del SELECT … FOR UPDATE
  const { lockCredits } = await import('../../modules/reading/reading.repository.js');
  const first = await pool.connect();
  const second = await pool.connect();
  try {
    await first.query('BEGIN');
    await lockCredits(first, reader.id, settings.max);
    await second.query('BEGIN');
    await second.query(`SET LOCAL lock_timeout = '300ms'`);
    await assert.rejects(lockCredits(second, reader.id, settings.max), (err: { code?: string }) => err.code === '55P03'); // lock_not_available
  } finally {
    await second.query('ROLLBACK');
    await first.query('ROLLBACK');
    second.release();
    first.release();
  }
});

test('RN-03: el registrado recibe un anuncio al final de cada capítulo; premium y admin, ni anuncio ni fila de saldo', async () => {
  const reader = await createUser('reader');
  const reading = await readOk(comic.slug, 1, reader.cookie);
  assert.ok(reading.ads.end);
  assert.deepEqual(Object.keys(reading.ads.end).sort(), ['body', 'brand', 'imageUrl']);
  assert.equal(reading.ads.interstitial, null, 'primera lectura: aún no toca el intersticial');

  for (const kind of ['premium', 'admin'] as const) {
    const user = await createUser(kind);
    const paid = await readOk(comic.slug, 5, user.cookie);
    assert.deepEqual([paid.ads, paid.balance], [{ interstitial: null, end: null }, null], kind);
    assert.equal(await credits(user.id), null, `${kind}: sin reading_credits`);
    assert.deepEqual(await readRows(user.id), [5], `${kind}: chapter_reads para marcar "Leído" (D2)`);
  }
});

test('RN-03: la 5.ª primera lectura trae el intersticial y pone reads_since_ad a 0; las relecturas no cuentan', async () => {
  const reader = await createUser('reader');
  for (const number of [1, 2, 3, 4]) {
    assert.equal((await readOk(comic.slug, number, reader.cookie)).ads.interstitial, null, `cap. ${number}`);
    await readOk(comic.slug, 1, reader.cookie); // relectura entre medias: no cuenta
  }
  assert.equal((await credits(reader.id))?.reads_since_ad, 4);
  const fifth = await readOk(comic.slug, 5, reader.cookie);
  assert.ok(fifth.ads.interstitial, '5.ª primera lectura');
  assert.deepEqual(Object.keys(fifth.ads.interstitial).sort(), ['body', 'brand', 'imageUrl']);
  assert.ok(fifth.ads.end, 'el anuncio final sigue');
  assert.equal((await credits(reader.id))?.reads_since_ad, 0);
  // "Recargar" (CU-03) es una relectura: ni intersticial ni cuenta.
  assert.equal((await readOk(comic.slug, 5, reader.cookie)).ads.interstitial, null);
  assert.equal((await credits(reader.id))?.reads_since_ad, 0);
});

test('RN-03: un 403 READING_LIMIT no cuenta para el intersticial; un contador por encima del límite lo da y vuelve a 0', async () => {
  const reader = await createUser('reader');
  await setCredits(reader, 0, 10);
  await pool.query('UPDATE reading_credits SET reads_since_ad = 4 WHERE user_id = $1', [reader.id]);
  assert.equal((await read(comic.slug, 3, reader.cookie)).status, 403);
  assert.equal((await credits(reader.id))?.reads_since_ad, 4);

  await pool.query('UPDATE reading_credits SET reads_since_ad = 7 WHERE user_id = $1', [reader.id]);
  assert.ok((await readOk(comic.slug, 1, reader.cookie)).ads.interstitial);
  assert.equal((await credits(reader.id))?.reads_since_ad, 0);
});

async function counts(chapterId: number): Promise<{ user: number; guest: number }> {
  const { rows } = await pool.query<{ user: number; guest: number }>(
    'SELECT coalesce(sum(user_reads), 0)::int AS user, coalesce(sum(guest_reads), 0)::int AS guest FROM chapter_read_counts WHERE chapter_id = $1',
    [chapterId],
  );
  return rows[0]!;
}

test('Seguridad: user_reads cuenta una vez a cada lector registrado y premium; el admin y el autor dueño no cuentan', async () => {
  const author = await createUser('author');
  const own = await createComic({ name: 'estadisticas-propia', authorId: author.id, chapters: [{ number: 1 }] });
  const chapterId = own.chapterIds.get('1')!;
  const [reader, premium, admin] = [await createUser('reader'), await createUser('premium'), await createUser('admin')];
  for (const user of [reader, reader, premium, premium, admin, author, author]) await readOk(own.slug, 1, user.cookie);
  assert.deepEqual(await counts(chapterId), { user: 2, guest: 0 });
});

test('Seguridad: guest_reads cuenta una vez por capítulo con la cookie firmada; una cookie alterada se ignora', async () => {
  const chapterId = stats.chapterIds.get('1')!;
  const first = await read(stats.slug, 1);
  assert.equal(first.status, 200);
  const setCookie = first.headers.getSetCookie().find((cookie) => cookie.startsWith('koma_guest_reads='));
  assert.ok(setCookie, 'Set-Cookie koma_guest_reads');
  assert.match(setCookie, /; Max-Age=2592000;/);
  assert.match(setCookie, /; Path=\//);
  assert.match(setCookie, /; HttpOnly/);
  assert.match(setCookie, /; SameSite=Lax/);
  assert.match(setCookie, new RegExp(`^koma_guest_reads=${chapterId}\\.[\\w-]{43};`));
  const cookie = setCookie.split(';')[0]!;
  assert.deepEqual(await counts(chapterId), { user: 0, guest: 1 });

  const again = await read(stats.slug, 1, cookie);
  assert.equal(again.status, 200);
  assert.equal(again.headers.getSetCookie().length, 0, 'ya contado: no reescribe la cookie');
  assert.deepEqual(await counts(chapterId), { user: 0, guest: 1 });

  const forged = cookie.replace(/\.[\w-]{43}$/, `.${'A'.repeat(43)}`);
  assert.equal((await read(stats.slug, 1, forged)).status, 200);
  assert.deepEqual(await counts(chapterId), { user: 0, guest: 2 });

  // Un cap. 3 sin anuncio completado no se lee ni se cuenta.
  assert.equal((await read(stats.slug, 3)).status, 403);
  assert.deepEqual(await counts(stats.chapterIds.get('3')!), { user: 0, guest: 0 });
});
