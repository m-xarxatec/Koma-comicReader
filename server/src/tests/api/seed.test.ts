import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { pool } from '../../db/pool.js';
import { seed } from '../../scripts/seed.js';

// reset-test-db.ts ya ejecutó el seed una vez sobre koma_test. Aquí se comprueba lo que dejó y que repetirlo
// no cambia nada (docs/modelo_datos.md, "Seeds"). Ningún otro test crea etiquetas ni anuncios.

after(() => pool.end());

test('RN-03: el seed deja las 12 etiquetas base y 3 anuncios de solo texto, cada fila auditada con system.seed', async () => {
  const { rows: tags } = await pool.query<{ slug: string; type: string }>('SELECT slug, type FROM tags ORDER BY id');
  assert.deepEqual(
    tags.filter((tag) => tag.type === 'genre').map((tag) => tag.slug),
    ['fantasia', 'aventura', 'comedia', 'drama', 'horror', 'misterio', 'romance', 'ciencia-ficcion'],
  );
  assert.deepEqual(
    tags.filter((tag) => tag.type === 'theme').map((tag) => tag.slug),
    ['magia', 'psicologico', 'sobrenatural', 'slice-of-life'],
  );

  const { rows: ads } = await pool.query<{ brand: string; image_key: string | null; active: boolean }>(
    'SELECT brand, image_key, active FROM ads ORDER BY id',
  );
  assert.deepEqual(
    ads.map((ad) => ad.brand),
    ['Tinta Eterna', 'Café Página Doble', 'Gomas Arrepentidas S.A.'],
  );
  assert.ok(ads.every((ad) => ad.image_key === null && ad.active));

  const { rows: audited } = await pool.query<{ entity_type: string; n: number; actors: number }>(
    `SELECT entity_type, count(*)::int AS n, count(actor_id)::int AS actors FROM audit_log
     WHERE action = 'system.seed' AND entity_type IN ('tags', 'ads') GROUP BY entity_type ORDER BY entity_type`,
  );
  assert.deepEqual(audited, [
    { entity_type: 'ads', n: 3, actors: 0 },
    { entity_type: 'tags', n: 12, actors: 0 },
  ]);
});

test('Seguridad: repetir el seed no crea etiquetas, anuncios ni entradas de auditoría', async () => {
  const requestId = randomUUID();
  const created = await seed(requestId);
  assert.deepEqual(created, { users: 0, settings: 0, tags: 0, ads: 0 });

  const { rows } = await pool.query<{ tags: number; ads: number; audits: number }>(
    `SELECT (SELECT count(*)::int FROM tags) AS tags, (SELECT count(*)::int FROM ads) AS ads,
            (SELECT count(*)::int FROM audit_log WHERE request_id = $1) AS audits`,
    [requestId],
  );
  assert.deepEqual(rows[0], { tags: 12, ads: 3, audits: 0 });
});
