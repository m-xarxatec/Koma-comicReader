import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, startTestServer } from './helpers.js';
import { createComic, createUser } from './reading-fixtures.js';

// Premium con el driver fake (el de .env y koma_test): contrato del bloque 4, "Premium"; RN-04, CU-21 y CU-27.
const srv = startTestServer();
const db = async () => (await import('../../db/pool.js')).pool;

interface SubscriptionJson {
  provider: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

const json = async <T>(res: Response) => (await res.json()) as T;

test('RN-04: sin suscripción, GET /api/payments/subscription devuelve null; sin sesión, 401', async () => {
  const reader = await createUser('reader');
  const res = await api(srv, 'GET', '/api/payments/subscription', { cookie: reader.cookie });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { subscription: null });
  assert.equal((await api(srv, 'GET', '/api/payments/subscription')).status, 401);
});

test('RN-04: con el driver fake, checkout y portal llevan a /pago-simulado', async () => {
  const reader = await createUser('reader');
  assert.deepEqual(await json(await api(srv, 'POST', '/api/payments/checkout', { cookie: reader.cookie })), { url: '/pago-simulado' });
  assert.deepEqual(await json(await api(srv, 'POST', '/api/payments/portal', { cookie: reader.cookie })), { url: '/pago-simulado' });
});

test('RN-04: "Pagar" da premium al momento por applySubscription, con subscription.start auditada por el propio usuario', async () => {
  const reader = await createUser('reader');
  const res = await api(srv, 'POST', '/api/payments/fake/pay', { cookie: reader.cookie });
  assert.equal(res.status, 200);
  const { user } = await json<{ user: { isPremium: boolean; premiumUntil: string } }>(res);
  assert.equal(user.isPremium, true);
  const days = (Date.parse(user.premiumUntil) - Date.now()) / 86_400_000;
  assert.ok(days > 29.9 && days <= 30, `${days} días`);

  const sub = await json<{ subscription: SubscriptionJson }>(await api(srv, 'GET', '/api/payments/subscription', { cookie: reader.cookie }));
  assert.deepEqual(sub.subscription, { provider: 'fake', status: 'active', currentPeriodEnd: user.premiumUntil, cancelAtPeriodEnd: false });

  const requestId = res.headers.get('x-request-id');
  const { rows } = await (await db()).query<{ action: string; actor_id: number; entity_type: string; after: Record<string, unknown>; ip: string }>(
    'SELECT action, actor_id, entity_type, after, host(ip) AS ip FROM audit_log WHERE request_id = $1',
    [requestId],
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(
    { ...rows[0]!, ip: rows[0]!.ip !== null },
    {
      action: 'subscription.start',
      actor_id: reader.id,
      entity_type: 'subscriptions',
      after: { status: 'active', currentPeriodEnd: user.premiumUntil, cancelAtPeriodEnd: false, provider: 'fake', userId: reader.id },
      ip: true,
    },
  );
  assert.ok(!JSON.stringify(rows[0]!.after).includes('fake_'), 'sin el id de la suscripción');
});

test('RN-04: ya premium, "Pagar" y el checkout dan 409; el admin no se hace premium (403)', async () => {
  const reader = await createUser('reader');
  assert.equal((await api(srv, 'POST', '/api/payments/fake/pay', { cookie: reader.cookie })).status, 200);
  assert.equal((await api(srv, 'POST', '/api/payments/fake/pay', { cookie: reader.cookie })).status, 409);
  assert.equal((await api(srv, 'POST', '/api/payments/checkout', { cookie: reader.cookie })).status, 409);
  const admin = await createUser('admin');
  assert.equal((await api(srv, 'POST', '/api/payments/fake/pay', { cookie: admin.cookie })).status, 403);
  assert.equal((await api(srv, 'POST', '/api/payments/checkout', { cookie: admin.cookie })).status, 403);
  assert.equal((await api(srv, 'POST', '/api/payments/fake/pay')).status, 401);
});

test('RN-04: "Cancelar" deja premium hasta el fin del periodo (CU-27) y audita subscription.cancel; repetirlo da 409', async () => {
  const reader = await createUser('reader');
  assert.equal((await api(srv, 'POST', '/api/payments/fake/cancel', { cookie: reader.cookie })).status, 409, 'sin suscripción');
  const paid = await json<{ user: { premiumUntil: string } }>(await api(srv, 'POST', '/api/payments/fake/pay', { cookie: reader.cookie }));

  const res = await api(srv, 'POST', '/api/payments/fake/cancel', { cookie: reader.cookie });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    subscription: { provider: 'fake', status: 'active', currentPeriodEnd: paid.user.premiumUntil, cancelAtPeriodEnd: true },
  });
  const me = await json<{ user: { isPremium: boolean } }>(await api(srv, 'GET', '/api/me', { cookie: reader.cookie }));
  assert.equal(me.user.isPremium, true);
  const { rows } = await (await db()).query<{ action: string; before: unknown; after: unknown }>(
    'SELECT action, before, after FROM audit_log WHERE request_id = $1',
    [res.headers.get('x-request-id')],
  );
  assert.deepEqual(rows, [{ action: 'subscription.cancel', before: { cancelAtPeriodEnd: false }, after: { cancelAtPeriodEnd: true } }]);
  assert.equal((await api(srv, 'POST', '/api/payments/fake/cancel', { cookie: reader.cookie })).status, 409);
});

test('RN-04: tras "Pagar", el registrado lee el cap. 4 sin gastar saldo ni ver anuncios (CU-24)', async () => {
  const reader = await createUser('reader');
  const comic = await createComic({ name: 'premium-pago', chapters: [{ number: 1 }, { number: 2 }, { number: 3 }, { number: 4 }] });
  await api(srv, 'POST', '/api/payments/fake/pay', { cookie: reader.cookie });
  const res = await api(srv, 'POST', `/api/comics/${comic.slug}/chapters/4/read`, { cookie: reader.cookie });
  assert.equal(res.status, 200);
  const { reading } = await json<{ reading: { balance: unknown; ads: { end: unknown; interstitial: unknown } } }>(res);
  assert.equal(reading.balance, null);
  assert.deepEqual(reading.ads, { end: null, interstitial: null });
});

test('Seguridad: el pago simulado exige el Origin permitido (CSRF)', async () => {
  const reader = await createUser('reader');
  const res = await fetch(`${srv.baseUrl}/api/payments/fake/pay`, { method: 'POST', headers: { Cookie: reader.cookie, Origin: 'http://evil.test' } });
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { code: string }).code, 'CSRF');
});
