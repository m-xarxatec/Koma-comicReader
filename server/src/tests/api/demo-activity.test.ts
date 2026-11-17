import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createServer, type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createComic, type TestComic } from './reading-fixtures.js';

// Actividad simulada (idea 24; «Pulido», D14–D21): una pasada real, en modo rápido, contra la app y koma_test, solo
// sobre obras de este archivo (runSessions; el catálogo entero lo comparten los demás tests). El script envía como
// Origin el de APP_URL, así que la app se levanta aquí en un puerto conocido de antemano y con ese origen permitido.

async function freePort(): Promise<number> {
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const ORIGIN = `http://127.0.0.1:${await freePort()}`;
process.env['APP_URL'] = ORIGIN;
process.env['ALLOWED_ORIGINS'] = ORIGIN;
process.env['AD_MIN_SECONDS'] = '1';
const PASSWORD = 'actividad-de-prueba-1';
const EMAILS = "email LIKE 'actividad%@demo.test'";

let server: Server | undefined;
const db = async () => (await import('../../db/pool.js')).pool;
const comics: TestComic[] = [];

before(async () => {
  const { app } = await import('../../app.js');
  server = app.listen(Number(new URL(ORIGIN).port), '127.0.0.1');
  await once(server, 'listening');
  // Dos obras con cuatro capítulos: los invitados leen 1 y 2, ven el anuncio en el 3 y nunca piden el 4.
  for (const name of ['actividad-a', 'actividad-b']) {
    comics.push(await createComic({ name, chapters: [1, 2, 3, 4].map((number) => ({ number, panels: 6 })) }));
  }
});

after(async () => {
  if (server) {
    const listening = server;
    listening.closeAllConnections();
    await new Promise((resolve) => listening.close(resolve));
  }
  await (await db()).end();
});

const count = async (sql: string) => Number((await (await db()).query<{ n: string }>(`SELECT count(*) AS n FROM ${sql}`)).rows[0]!.n);

async function pass() {
  const { runSessions } = await import('../../scripts/demo-activity.js');
  const context = {
    origin: ORIGIN,
    password: PASSWORD,
    speed: 0.02,
    day: 20_000,
    slugs: comics.map((comic) => comic.slug),
    commentGapMs: 0, // cada cuenta lee como mucho 4 capítulos: nunca llega a los 5 comentarios por minuto de RN-13
    totals: { reads: 0, guestReads: 0, comments: 0, progress: 0 },
  };
  return { result: await runSessions(context), totals: context.totals };
}

test('Seguridad: (D14–D18) una pasada registra 3 cuentas @demo.test por la API, que leen, envían su progreso y comentan; los invitados leen sin pasar del cap. 3', { timeout: 240_000 }, async () => {
  const chapterIds = comics.flatMap((comic) => [...comic.chapterIds.values()]);
  const { result, totals } = await pass();
  assert.deepEqual(result, { sessions: 3, registered: 3, failed: 0 }, 'RN-13: 3 altas por pasada');

  // Las cuentas existen, con su nombre visible, y son lectores corrientes.
  const { rows: users } = await (await db()).query<{ email: string; display_name: string; role: string; is_author: boolean }>(
    `SELECT email, display_name, role, is_author FROM users WHERE ${EMAILS} ORDER BY email`,
  );
  assert.deepEqual(users, [
    { email: 'actividad1@demo.test', display_name: 'Lucía_lee', role: 'user', is_author: false },
    { email: 'actividad2@demo.test', display_name: 'MarcoV', role: 'user', is_author: false },
    { email: 'actividad3@demo.test', display_name: 'Nerea Sol', role: 'user', is_author: false },
  ]);

  // Lecturas y progreso (RN-21), todo en las obras de la pasada.
  const reads = await count(`chapter_reads r JOIN users u ON u.id = r.user_id WHERE u.${EMAILS}`);
  assert.equal(reads, totals.reads);
  assert.ok(reads >= 6, `lecturas: ${reads}`);
  assert.equal(await count(`chapter_reads r JOIN users u ON u.id = r.user_id WHERE u.${EMAILS} AND r.chapter_id <> ALL('{${chapterIds.join(',')}}'::int[])`), 0);
  assert.equal(await count(`chapter_reads r JOIN users u ON u.id = r.user_id WHERE u.${EMAILS} AND r.last_panel BETWEEN 1 AND 6`), totals.progress);
  assert.equal(totals.progress, reads, 'cada lectura envía su viñeta máxima');

  // Comentarios (RN-11): los que dice la pasada, con textos de la lista y como mucho uno por cuenta y viñeta.
  const { COMMENT_TEXTS } = await import('../../scripts/demo-activity-plan.js');
  const { rows: comments } = await (await db()).query<{ body: string; user_id: number; panel_id: number }>(
    `SELECT m.body, m.user_id, m.panel_id FROM comments m JOIN users u ON u.id = m.user_id WHERE u.${EMAILS}`,
  );
  assert.equal(comments.length, totals.comments);
  for (const comment of comments) assert.ok(COMMENT_TEXTS.includes(comment.body), comment.body);
  assert.equal(new Set(comments.map((comment) => `${comment.user_id}:${comment.panel_id}`)).size, comments.length);

  // Invitados (RN-01, D18): cuentan en guest_reads; como mucho 9 y ninguno en el cap. 4.
  assert.ok(totals.guestReads >= 3 && totals.guestReads <= 9, `lecturas de invitado: ${totals.guestReads}`);
  const guestReads = await (await db()).query<{ number: number; guest_reads: number }>(
    `SELECT ch.number, c.guest_reads FROM chapter_read_counts c JOIN chapters ch ON ch.id = c.chapter_id WHERE ch.id = ANY($1::int[]) AND c.guest_reads > 0`,
    [chapterIds],
  );
  assert.equal(guestReads.rows.reduce((sum, row) => sum + row.guest_reads, 0), totals.guestReads);
  assert.ok(guestReads.rows.every((row) => row.number <= 3), 'ningún invitado lee el cap. 4');
  assert.ok(guestReads.rows.some((row) => row.number === 3), 'algún invitado completa el anuncio y lee el cap. 3');

  // Rastro en la auditoría: alta y cierre de sesión de cada cuenta; ni lecturas ni comentarios.
  const audit = (action: string) => count(`audit_log a JOIN users u ON u.id = a.actor_id WHERE u.${EMAILS} AND a.action = '${action}'`);
  assert.equal(await audit('user.register'), 3);
  assert.equal(await audit('auth.logout'), 3);
});

test('Seguridad: (D14, RN-13) una segunda pasada no registra más cuentas (límite de altas), entra con las que hay y no duplica comentarios ni lecturas', { timeout: 240_000 }, async () => {
  const readsBefore = await count(`chapter_reads r JOIN users u ON u.id = r.user_id WHERE u.${EMAILS}`);
  const { result } = await pass();
  assert.deepEqual(result, { sessions: 3, registered: 0, failed: 0 });
  assert.equal(await count(`users WHERE ${EMAILS}`), 3, 'las otras tres, en una pasada al menos 1 h después');
  assert.equal(await count(`audit_log a JOIN users u ON u.id = a.actor_id WHERE u.${EMAILS} AND a.action = 'auth.login_ok'`), 3);
  const { rows } = await (await db()).query<{ n: string }>(
    `SELECT count(*) AS n FROM comments m JOIN users u ON u.id = m.user_id WHERE u.${EMAILS} GROUP BY m.user_id, m.panel_id HAVING count(*) > 1`,
  );
  assert.equal(rows.length, 0, 'ninguna cuenta comenta dos veces la misma viñeta');
  const readsAfter = await count(`chapter_reads r JOIN users u ON u.id = r.user_id WHERE u.${EMAILS}`);
  assert.ok(readsAfter >= readsBefore, 'sigue leyendo lo que le quedaba, sin perder lo leído');
});
