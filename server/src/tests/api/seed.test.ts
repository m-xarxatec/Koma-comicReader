import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { pool } from '../../db/pool.js';
import { seed } from '../../scripts/seed.js';

// reset-test-db.ts ya ejecutó el seed una vez sobre koma_test. Aquí se comprueba lo que dejó y que repetirlo
// no cambia nada (docs/modelo_datos.md, "Seeds"). Los archivos de test corren en paralelo y otros crean
// etiquetas propias (importación, catálogo): solo se miran las 12 base. Ningún otro test crea anuncios.

after(() => pool.end());

const BASE_GENRES = ['fantasia', 'aventura', 'comedia', 'drama', 'horror', 'misterio', 'romance', 'ciencia-ficcion'];
const BASE_THEMES = ['magia', 'psicologico', 'sobrenatural', 'slice-of-life'];
const BASE_TAGS = [...BASE_GENRES, ...BASE_THEMES];

test('RN-03: el seed deja las 12 etiquetas base y 3 anuncios de solo texto, cada fila auditada con system.seed', async () => {
  const { rows: tags } = await pool.query<{ slug: string; type: string }>(
    'SELECT slug, type FROM tags WHERE slug = ANY($1::text[]) ORDER BY id',
    [BASE_TAGS],
  );
  assert.deepEqual(
    tags.filter((tag) => tag.type === 'genre').map((tag) => tag.slug),
    BASE_GENRES,
  );
  assert.deepEqual(
    tags.filter((tag) => tag.type === 'theme').map((tag) => tag.slug),
    BASE_THEMES,
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
  assert.deepEqual(created, { users: 0, settings: 0, tags: 0, ads: 0, subscriptions: 0 });

  const { rows } = await pool.query<{ tags: number; ads: number; audits: number }>(
    `SELECT (SELECT count(*)::int FROM tags WHERE slug = ANY($2::text[])) AS tags, (SELECT count(*)::int FROM ads) AS ads,
            (SELECT count(*)::int FROM audit_log WHERE request_id = $1) AS audits`,
    [requestId, BASE_TAGS],
  );
  assert.deepEqual(rows[0], { tags: 12, ads: 3, audits: 0 });
});

// .env de desarrollo y de koma_test: PAYMENTS_DRIVER=fake (reset-test-db.ts ya sembró la suscripción).
const PREMIUM = 'premium@demo.test';

async function premiumState() {
  const { rows } = await pool.query<{ id: number; premium_until: Date | null }>('SELECT id, premium_until FROM users WHERE email = $1', [PREMIUM]);
  const user = rows[0]!;
  const { rows: subs } = await pool.query<{ id: number; provider: string; status: string; current_period_end: Date; provider_subscription_id: string }>(
    'SELECT id, provider, status, current_period_end, provider_subscription_id FROM subscriptions WHERE user_id = $1 ORDER BY id',
    [user.id],
  );
  return { user, subs };
}

test('RN-04: con fake, la cuenta premium tiene una suscripción simulada activa y premium_until es su fin de periodo', async () => {
  const { user, subs } = await premiumState();
  const active = subs.filter((sub) => sub.status === 'active');
  assert.ok(active.length >= 1);
  const last = active.at(-1)!;
  assert.equal(last.provider, 'fake');
  assert.match(last.provider_subscription_id, /^fake_[0-9a-f-]{36}$/);
  const days = (last.current_period_end.getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 29 && days <= 30, `fin de periodo a ${days} días`);
  assert.equal(user.premium_until?.getTime(), Math.max(...active.map((sub) => sub.current_period_end.getTime())));

  const { rows: audited } = await pool.query<{ entity_id: string; actor_id: number | null; after: unknown }>(
    `SELECT entity_id, actor_id, after FROM audit_log WHERE action = 'system.seed' AND entity_type = 'subscriptions' ORDER BY id`,
  );
  const first = audited.find((row) => row.entity_id === String(subs[0]!.id));
  assert.deepEqual(first, { entity_id: String(subs[0]!.id), actor_id: null, after: { id: subs[0]!.id, userId: user.id } });
});

test('RN-04: si la suscripción simulada ya no está activa, repetir el seed crea otra y recalcula premium_until (D15)', async () => {
  const before = await premiumState();
  // Solo se cambia el estado: premium_until no se toca aquí, así la cuenta sigue siendo premium para los demás tests.
  await pool.query(`UPDATE subscriptions SET status = 'canceled' WHERE user_id = $1 AND provider = 'fake'`, [before.user.id]);
  const created = await seed(randomUUID());
  assert.equal(created.subscriptions, 1);
  const after = await premiumState();
  assert.equal(after.subs.length, before.subs.length + 1);
  const newest = after.subs.at(-1)!;
  assert.equal(newest.status, 'active');
  assert.equal(after.user.premium_until?.getTime(), newest.current_period_end.getTime());
  assert.equal((await seed(randomUUID())).subscriptions, 0);
});
