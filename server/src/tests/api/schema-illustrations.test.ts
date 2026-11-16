import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';

// Restricciones de la migración 010 (ilustraciones, RN-22) sobre koma_test. Cada test corre en una transacción que
// se deshace al final.

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

async function expectViolation(client: PoolClient, sql: string, params: unknown[], code: string, constraint: string) {
  await client.query('SAVEPOINT expected_failure');
  await assert.rejects(client.query(sql, params), { code, constraint });
  await client.query('ROLLBACK TO SAVEPOINT expected_failure');
}

const KEY = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}.webp`;
const CHECK = '23514';

async function insertUser(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, display_name) VALUES ('ilustra-esquema@lectura.test', 'sin-uso', 'Esquema') RETURNING id`,
  );
  return rows[0]!.id;
}

const INSERT = `INSERT INTO illustrations (user_id, title, image_key, width, height, status, rejection_reason, published_at)
                VALUES ($1, 'Título', $2, $3, $4, $5, $6, $7) RETURNING id`;

test('RN-22: una ilustración nace pending; rejected exige motivo y approved exige fecha de publicación', async () => {
  await inRolledBackTransaction(async (client) => {
    const user = await insertUser(client);
    const { rows } = await client.query<{ status: string; deleted_at: Date | null }>(
      `INSERT INTO illustrations (user_id, title, image_key, width, height) VALUES ($1, 'Título', $2, 10, 10) RETURNING status, deleted_at`,
      [user, KEY(1)],
    );
    assert.deepEqual(rows[0], { status: 'pending', deleted_at: null });
    await expectViolation(client, INSERT, [user, KEY(2), 10, 10, 'rejected', null, null], CHECK, 'illustrations_rejection_reason');
    await expectViolation(client, INSERT, [user, KEY(3), 10, 10, 'approved', null, null], CHECK, 'illustrations_published');
    await expectViolation(client, INSERT, [user, KEY(4), 10, 10, 'draft', null, null], CHECK, 'illustrations_status_check');
    await client.query(INSERT, [user, KEY(5), 10, 10, 'rejected', 'Motivo', null]);
    await client.query(INSERT, [user, KEY(6), 10, 10, 'approved', null, new Date()]);
  });
});

test('Seguridad: la BD solo acepta claves de imagen UUID.ext, únicas, y medidas positivas en una ilustración', async () => {
  await inRolledBackTransaction(async (client) => {
    const user = await insertUser(client);
    for (const key of ['../../etc/passwd', 'foto.png', KEY(1).replace('.webp', '.gif'), '']) {
      await expectViolation(client, INSERT, [user, key, 10, 10, 'pending', null, null], CHECK, 'illustrations_image_key_check');
    }
    await expectViolation(client, INSERT, [user, KEY(1), 0, 10, 'pending', null, null], CHECK, 'illustrations_width_check');
    await expectViolation(client, INSERT, [user, KEY(1), 10, -1, 'pending', null, null], CHECK, 'illustrations_height_check');
    await client.query(INSERT, [user, KEY(1), 10, 10, 'pending', null, null]);
    await expectViolation(client, INSERT, [user, KEY(1), 10, 10, 'pending', null, null], '23505', 'illustrations_image_key_key');
  });
});

test('RN-22: las etiquetas de una ilustración son slugs y no se repiten en la misma ilustración', async () => {
  await inRolledBackTransaction(async (client) => {
    const user = await insertUser(client);
    const { rows } = await client.query<{ id: number }>(INSERT, [user, KEY(1), 10, 10, 'pending', null, null]);
    const id = rows[0]!.id;
    const insertTag = 'INSERT INTO illustration_tags (illustration_id, tag) VALUES ($1, $2)';
    for (const tag of ['Fan Art', 'ñandú', '-tinta', 'tinta-', 'a--b', '']) {
      await expectViolation(client, insertTag, [id, tag], CHECK, 'illustration_tags_tag_check');
    }
    await client.query(insertTag, [id, 'fan-art']);
    await expectViolation(client, insertTag, [id, 'fan-art'], '23505', 'illustration_tags_pkey');
  });
});
