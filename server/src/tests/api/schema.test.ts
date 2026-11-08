import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';

// Restricciones de las migraciones 004 y 005 sobre koma_test. Cada test corre en una transacción que se
// deshace al final: no deja filas que alteren otros tests (catálogo, lectura).

after(() => pool.end());

async function inRolledBackTransaction(fn: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

// Un fallo esperado aborta la transacción: se aísla en un savepoint para poder seguir.
async function expectViolation(client: PoolClient, sql: string, params: unknown[], code: string, constraint: string) {
  await client.query('SAVEPOINT expected_failure');
  await assert.rejects(client.query(sql, params), { code, constraint });
  await client.query('ROLLBACK TO SAVEPOINT expected_failure');
}

const KEY = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}.webp`;

async function insertComic(client: PoolClient, slug: string): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO comics (slug, title, synopsis, author_credit, license, status)
     VALUES ($1, 'Obra', 'Sinopsis', 'Autoría', 'CC BY 4.0', 'approved') RETURNING id`,
    [slug],
  );
  return rows[0]!.id;
}

const INSERT_CHAPTER = `INSERT INTO chapters (comic_id, number, title, status, rejection_reason, published_at, deleted_at)
  VALUES ($1, $2, 'Capítulo', $3, $4, $5, $6) RETURNING id`;

test('RN-17: la BD rechaza una obra +18 aprobada', async () => {
  await inRolledBackTransaction(async (client) => {
    await expectViolation(
      client,
      `INSERT INTO comics (slug, title, synopsis, author_credit, license, is_adult, status)
       VALUES ('adulta', 'Obra', 'Sinopsis', 'Autoría', 'CC BY 4.0', true, 'approved')`,
      [],
      '23514',
      'comics_adult_not_approved',
    );
    // +18 pendiente sí entra: el admin la rechaza con motivo (CU-32).
    await client.query(
      `INSERT INTO comics (slug, title, synopsis, author_credit, license, is_adult)
       VALUES ('adulta', 'Obra', 'Sinopsis', 'Autoría', 'CC BY 4.0', true)`,
    );
  });
});

test('RN-09: el número de capítulo es único entre los vivos; un rechazado o retirado lo libera', async () => {
  await inRolledBackTransaction(async (client) => {
    const comicId = await insertComic(client, 'numeros');
    await client.query(INSERT_CHAPTER, [comicId, 1, 'approved', null, new Date(), null]);
    await expectViolation(client, INSERT_CHAPTER, [comicId, 1, 'draft', null, null, null], '23505', 'chapters_comic_number_uq');

    // El 2 rechazado y el 3 retirado no bloquean su número: el reemplazo lo hereda.
    await client.query(INSERT_CHAPTER, [comicId, 2, 'rejected', 'Motivo', null, null]);
    await client.query(INSERT_CHAPTER, [comicId, 2, 'approved', null, new Date(), null]);
    await client.query(INSERT_CHAPTER, [comicId, 3, 'approved', null, new Date(), new Date()]);
    await client.query(INSERT_CHAPTER, [comicId, 3, 'draft', null, null, null]);
  });
});

test('RN-18: cada viñeta guarda ancho y alto positivos y una posición única en su capítulo', async () => {
  await inRolledBackTransaction(async (client) => {
    const comicId = await insertComic(client, 'medidas');
    const { rows } = await client.query<{ id: number }>(INSERT_CHAPTER, [comicId, 1, 'approved', null, new Date(), null]);
    const chapterId = rows[0]!.id;
    const insertPanel = 'INSERT INTO panels (chapter_id, position, image_key, width, height) VALUES ($1, $2, $3, $4, $5)';

    await client.query(insertPanel, [chapterId, 1, KEY(1), 800, 1200]);
    await expectViolation(client, insertPanel, [chapterId, 2, KEY(2), 0, 1200], '23514', 'panels_width_check');
    await expectViolation(client, insertPanel, [chapterId, 2, KEY(2), 800, -1], '23514', 'panels_height_check');
    await expectViolation(client, insertPanel, [chapterId, 1, KEY(2), 800, 1200], '23505', 'panels_chapter_position_uq');
  });
});

test('Seguridad: la BD solo acepta claves de imagen UUID.ext generadas por el servidor', async () => {
  await inRolledBackTransaction(async (client) => {
    for (const key of ['../../etc/passwd', 'portada.webp', `${KEY(1)}.php`, KEY(1).replace('.webp', '.gif')]) {
      await expectViolation(
        client,
        `INSERT INTO comics (slug, title, synopsis, author_credit, license, cover_key)
         VALUES ('clave', 'Obra', 'Sinopsis', 'Autoría', 'CC BY 4.0', $1)`,
        [key],
        '23514',
        'comics_cover_key_check',
      );
    }
  });
});

test('RN-11: la BD rechaza un comentario vacío o de más de 500 caracteres (puntos de código)', async () => {
  await inRolledBackTransaction(async (client) => {
    const comicId = await insertComic(client, 'comentarios-check');
    const { rows } = await client.query<{ id: number }>(INSERT_CHAPTER, [comicId, 1, 'approved', null, new Date(), null]);
    const chapterId = rows[0]!.id;
    const panel = await client.query<{ id: number }>(
      'INSERT INTO panels (chapter_id, position, image_key, width, height) VALUES ($1, 1, $2, 10, 10) RETURNING id',
      [chapterId, KEY(901)],
    );
    const user = await client.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, display_name) VALUES ('check-comentario@demo.test', 'x', 'Check') RETURNING id`,
    );
    const insert = 'INSERT INTO comments (panel_id, user_id, body) VALUES ($1, $2, $3)';
    const params = (body: string) => [panel.rows[0]!.id, user.rows[0]!.id, body];
    await expectViolation(client, insert, params(''), '23514', 'comments_body_check');
    await expectViolation(client, insert, params('x'.repeat(501)), '23514', 'comments_body_check');
    await client.query(insert, params('😀'.repeat(500))); // 500 caracteres, 1000 unidades UTF-16
  });
});

test('RN-04: subscriptions solo acepta proveedores y estados conocidos y un id de proveedor único; payment_events, un id por evento', async () => {
  await inRolledBackTransaction(async (client) => {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, display_name) VALUES ('schema-sub@demo.test', 'x', 'Suscriptora') RETURNING id`,
    );
    const userId = rows[0]!.id;
    const INSERT_SUB = `INSERT INTO subscriptions (user_id, provider, provider_subscription_id, status, current_period_end)
      VALUES ($1, $2, $3, $4, now() + interval '30 days')`;
    await client.query(INSERT_SUB, [userId, 'fake', 'fake_schema', 'active']);
    await expectViolation(client, INSERT_SUB, [userId, 'paypal', 'pp_1', 'active'], '23514', 'subscriptions_provider_check');
    await expectViolation(client, INSERT_SUB, [userId, 'stripe', 'sub_1', 'expired'], '23514', 'subscriptions_status_check');
    await expectViolation(client, INSERT_SUB, [userId, 'stripe', 'fake_schema', 'active'], '23505', 'subscriptions_provider_subscription_id_key');

    await client.query(`INSERT INTO payment_events (id, type) VALUES ('evt_schema', 'invoice.paid')`);
    await expectViolation(client, `INSERT INTO payment_events (id, type) VALUES ('evt_schema', 'invoice.paid')`, [], '23505', 'payment_events_pkey');
  });
});
