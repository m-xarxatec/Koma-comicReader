import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { api, sessionCookie, startTestServer } from './helpers.js';
import { createComic, createUser, RUN, type TestComic, type TestUser } from './reading-fixtures.js';

// Recorrido de la demo (pulido, 18-nov): el MVP de punta a punta por la API real, como lo enseñará la presentación.
// Un visitante encuentra una obra y la lee hasta el muro, se registra, gasta su saldo, comenta una viñeta y paga
// premium en modo prueba; un autor envía una obra, el admin la aprueba y modera el comentario, y cada acción
// sensible queda en la auditoría. Cada regla tiene ya su test detallado: este comprueba que las piezas encajan.
// Los tests de este archivo van en orden y comparten estado. AD_MIN_SECONDS a 1 s para completar el anuncio de
// verdad (GET …/ad) sin una espera larga; el almacenamiento y el temporal de multer, en carpetas propias.
const storageDir = mkdtempSync(path.join(tmpdir(), 'koma-journey-storage-'));
const uploadTmp = mkdtempSync(path.join(tmpdir(), 'koma-journey-tmp-'));
process.env['STORAGE_DRIVER'] = 'local';
process.env['STORAGE_LOCAL_DIR'] = storageDir;
process.env['TMPDIR'] = uploadTmp;
process.env['AD_MIN_SECONDS'] = '1';

const srv = startTestServer();
after(async () => {
  await rm(storageDir, { recursive: true, force: true });
  await rm(uploadTmp, { recursive: true, force: true });
});

interface Reading {
  chapter: { number: number };
  panels: { position: number; url: string }[];
  ads: { interstitial: unknown; end: { brand: string } | null };
  balance: { balance: number; max: number; retryAt: string | null } | null;
}
interface Me {
  id: number;
  email: string;
  role: string;
  isPremium: boolean;
}

// PNG mínimo con su firma y su cabecera IHDR (como author-chapters.test.ts): el servidor comprueba la firma y las medidas.
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const png = () =>
  Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...[...'IHDR'].map((c) => c.charCodeAt(0)), ...be32(800), ...be32(1200), 8, 6, 0, 0, 0, ...be32(0)]);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function read(slug: string, number: number, options: { cookie?: string; adToken?: string } = {}) {
  const headers: Record<string, string> = { Origin: srv.origin };
  if (options.cookie) headers['Cookie'] = options.cookie;
  if (options.adToken) headers['X-Ad-Token'] = options.adToken;
  return fetch(`${srv.baseUrl}/api/comics/${slug}/chapters/${number}/read`, { method: 'POST', headers });
}

async function readOk(slug: string, number: number, options: Parameters<typeof read>[2] = {}): Promise<Reading> {
  const res = await read(slug, number, options);
  assert.equal(res.status, 200, `cap. ${number}: ${res.status} ${await res.clone().text()}`);
  return ((await res.json()) as { reading: Reading }).reading;
}

async function codeOf(res: Response): Promise<string> {
  return `${res.status} ${((await res.json()) as { code: string }).code}`;
}

async function me(cookie: string): Promise<Me> {
  const res = await api(srv, 'GET', '/api/me', { cookie });
  assert.equal(res.status, 200);
  const { user } = (await res.json()) as { user: Me | null };
  assert.ok(user, 'con sesión');
  return user;
}

// --- Estado compartido del recorrido ---
let maxBalance: number;
let comic: TestComic; // la obra que encuentra el visitante: 2 capítulos libres, tantos como saldo y uno más
let admin: TestUser;
let author: TestUser;
let readerCookie = '';
let commentId = 0;
let authorSlug = '';
const readerEmail = `lectora-${RUN}@recorrido.test`;

before(async () => {
  const { pool } = await import('../../db/pool.js');
  const { rows } = await pool.query<{ value: number }>(`SELECT value FROM settings WHERE key = 'reading.max_balance'`);
  maxBalance = Number(rows[0]!.value);
  const chapters = Array.from({ length: 2 + maxBalance + 1 }, (_, i) => ({ number: i + 1 }));
  comic = await createComic({ name: 'recorrido', title: `Recorrido ${RUN}`, chapters });
  admin = await createUser('admin');
  author = await createUser('author');
});

test('RN-01: un visitante encuentra la obra y la lee hasta el muro: caps. 1–2 libres, el 3 tras el anuncio y el 4 pide cuenta', async () => {
  const found = await fetch(`${srv.baseUrl}/api/comics?q=${encodeURIComponent(`Recorrido ${RUN}`)}`);
  assert.equal(found.status, 200);
  assert.deepEqual(((await found.json()) as { comics: { slug: string }[] }).comics.map((item) => item.slug), [comic.slug]);
  assert.equal((await fetch(`${srv.baseUrl}/obra/${comic.slug}`)).status, 200, 'la ficha');

  for (const number of [1, 2]) assert.equal((await readOk(comic.slug, number)).balance, null, `cap. ${number} sin cuenta`);
  assert.equal(await codeOf(await read(comic.slug, 3)), '403 AD_NOT_COMPLETED', 'cap. 3 sin anuncio');

  const ad = await fetch(`${srv.baseUrl}/api/comics/${comic.slug}/ad`);
  assert.equal(ad.status, 200);
  const { adToken } = (await ad.json()) as { adToken: string };
  await wait(1100); // AD_MIN_SECONDS = 1
  assert.equal((await readOk(comic.slug, 3, { adToken })).chapter.number, 3, 'cap. 3 con el anuncio completado');

  assert.equal(await codeOf(await read(comic.slug, 4, { adToken })), '401 UNAUTHENTICATED', 'cap. 4: la invitación a registrarse');
});

test('RN-12: el visitante se registra y su sesión vale al momento', async () => {
  const res = await api(srv, 'POST', '/api/auth/register', {
    body: { email: readerEmail, password: 'una-contraseña-de-demo', displayName: `Lectora ${RUN}` },
  });
  assert.equal(res.status, 201, await res.clone().text());
  readerCookie = sessionCookie(res);
  assert.ok(readerCookie, 'la cookie de sesión');
  const user = await me(readerCookie);
  assert.deepEqual([user.email, user.role, user.isPremium], [readerEmail, 'user', false]);
});

test('RN-02: el lector gasta su saldo desde el cap. 3, releer no consume y sin saldo llega el límite con retryAt', async () => {
  for (const number of [1, 2]) assert.equal((await readOk(comic.slug, number, { cookie: readerCookie })).balance?.balance, maxBalance, `cap. ${number} no consume`);
  for (let spent = 1; spent <= maxBalance; spent++) {
    const reading = await readOk(comic.slug, 2 + spent, { cookie: readerCookie });
    assert.equal(reading.balance?.balance, maxBalance - spent, `cap. ${2 + spent}`);
  }
  assert.equal((await readOk(comic.slug, 3, { cookie: readerCookie })).balance?.balance, 0, 'releer el cap. 3 no consume');

  const limit = await read(comic.slug, 3 + maxBalance, { cookie: readerCookie });
  assert.equal(limit.status, 403);
  const body = (await limit.json()) as { code: string; retryAt?: string };
  assert.equal(body.code, 'READING_LIMIT');
  assert.ok(body.retryAt && Date.parse(body.retryAt) > Date.now(), 'retryAt, la próxima recarga');
});

test('RN-03: el lector ve un anuncio al final del capítulo', async () => {
  const reading = await readOk(comic.slug, 1, { cookie: readerCookie });
  assert.ok(reading.ads.end?.brand, 'el anuncio del final');
});

test('RN-11: el lector comenta una viñeta y el comentario sale en la lista pública con su nombre', async () => {
  const url = `/api/comics/${comic.slug}/chapters/1/panels/1/comments`;
  const res = await api(srv, 'POST', url, { cookie: readerCookie, body: { body: `¡Qué viñeta! ${RUN}` } });
  assert.equal(res.status, 201, await res.clone().text());
  commentId = ((await res.json()) as { comment: { id: number } }).comment.id;

  const list = (await (await api(srv, 'GET', url)).json()) as { comments: { id: number; body: string; authorName: string }[] };
  assert.deepEqual(list.comments.map(({ id, body, authorName }) => [id, body, authorName]), [[commentId, `¡Qué viñeta! ${RUN}`, `Lectora ${RUN}`]]);
});

test('RN-04: el lector paga premium en modo prueba y lee sin límite ni anuncios', async () => {
  const res = await api(srv, 'POST', '/api/payments/fake/pay', { cookie: readerCookie });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal((await me(readerCookie)).isPremium, true);

  const reading = await readOk(comic.slug, 3 + maxBalance, { cookie: readerCookie }); // el que antes daba READING_LIMIT
  assert.deepEqual(reading.ads, { interstitial: null, end: null }, 'sin anuncios');
  assert.equal(reading.balance, null, 'sin saldo');
});

test('RN-05: el autor crea una obra y envía su primer capítulo a revisión; mientras, no es pública', async () => {
  const created = await api(srv, 'POST', '/api/author/comics', {
    cookie: author.cookie,
    body: {
      title: `Estreno ${RUN}`,
      synopsis: 'La obra que se aprueba en la demo.',
      authorCredit: 'Autoría original',
      license: 'cc-by-4.0',
      tags: ['fantasia'],
      contentWarning: null,
      isAdult: false,
      authorshipDeclared: true,
    },
  });
  assert.equal(created.status, 201, await created.clone().text());
  const { comic: work } = (await created.json()) as { comic: { slug: string; status: string } };
  assert.equal(work.status, 'pending');
  authorSlug = work.slug;

  const chapters = `/api/author/comics/${authorSlug}/chapters`;
  const chapter = await api(srv, 'POST', chapters, { cookie: author.cookie, body: { number: 1 } });
  assert.equal(chapter.status, 201, await chapter.clone().text());
  assert.equal(((await chapter.json()) as { chapter: { status: string } }).chapter.status, 'draft');

  const form = new FormData();
  form.append('image', new Blob([png()]), 'vineta.png');
  const panel = await fetch(`${srv.baseUrl}${chapters}/1/panels`, { method: 'POST', headers: { Origin: srv.origin, Cookie: author.cookie }, body: form });
  assert.equal(panel.status, 201, await panel.clone().text());

  assert.equal((await api(srv, 'POST', `${chapters}/1/submit`, { cookie: author.cookie })).status, 200);

  assert.equal((await fetch(`${srv.baseUrl}/obra/${authorSlug}`)).status, 404, 'la ficha, para un visitante');
  assert.equal(await codeOf(await read(authorSlug, 1)), '404 NOT_FOUND', 'el capítulo, para un visitante');
});

test('RN-05: solo el admin aprueba; con la obra y el capítulo aprobados, un visitante los lee', async () => {
  const approveComic = `/api/admin/comics/${authorSlug}/approve`;
  const approveChapter = `/api/admin/comics/${authorSlug}/chapters/1/approve`;
  assert.equal(await codeOf(await api(srv, 'POST', approveComic, { cookie: readerCookie })), '403 FORBIDDEN', 'el lector no aprueba');
  assert.equal(await codeOf(await api(srv, 'POST', approveComic, { cookie: author.cookie })), '403 FORBIDDEN', 'el autor tampoco');

  assert.equal((await api(srv, 'POST', approveComic, { cookie: admin.cookie })).status, 204);
  assert.equal((await fetch(`${srv.baseUrl}/obra/${authorSlug}`)).status, 200, 'la ficha ya es pública');
  assert.equal(await codeOf(await read(authorSlug, 1)), '404 NOT_FOUND', 'el capítulo sigue en revisión');

  assert.equal((await api(srv, 'POST', approveChapter, { cookie: admin.cookie })).status, 204);
  assert.equal((await readOk(authorSlug, 1)).panels.length, 1, 'el visitante lee la viñeta subida');
});

test('Seguridad: el admin oculta el comentario y deja de verse en la lista pública', async () => {
  assert.equal(await codeOf(await api(srv, 'POST', `/api/admin/comments/${commentId}/hide`, { cookie: readerCookie })), '403 FORBIDDEN', 'el lector no modera');
  assert.equal((await api(srv, 'POST', `/api/admin/comments/${commentId}/hide`, { cookie: admin.cookie })).status, 204);
  const list = (await (await api(srv, 'GET', `/api/comics/${comic.slug}/chapters/1/panels/1/comments`)).json()) as { total: number };
  assert.equal(list.total, 0);
});

test('Seguridad: cada acción sensible del recorrido está en la auditoría con su actor, y solo el admin la consulta', async () => {
  assert.equal(await codeOf(await api(srv, 'GET', '/api/admin/audit', { cookie: readerCookie })), '403 FORBIDDEN');

  const actions = async (cookie: string) => {
    const { email } = await me(cookie);
    const res = await api(srv, 'GET', `/api/admin/audit?actor=${encodeURIComponent(email)}`, { cookie: admin.cookie });
    assert.equal(res.status, 200);
    return new Set(((await res.json()) as { entries: { action: string }[] }).entries.map((entry) => entry.action));
  };
  const expected: [string, string, string[]][] = [
    ['lectora', readerCookie, ['user.register', 'subscription.start']],
    ['autor', author.cookie, ['comic.create', 'chapter.create', 'chapter.submit']],
    ['admin', admin.cookie, ['comic.approve', 'chapter.approve', 'comment.hide']],
  ];
  for (const [who, cookie, wanted] of expected) {
    const found = await actions(cookie);
    for (const action of wanted) assert.ok(found.has(action), `${who}: ${action}`);
  }
});
