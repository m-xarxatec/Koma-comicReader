import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, beforeEach, test, type Mock } from 'node:test';
import Stripe from 'stripe';
import type { PaymentsDriver } from '../../integrations/payments/driver.js';
import type { SubscriptionSnapshot } from '../../modules/payments/payments.rules.js';
import { api, startTestServer } from './helpers.js';
import { createUser } from './reading-fixtures.js';

// Driver `stripe` sin red (contrato del bloque 4; RN-04): Checkout, portal y webhook con syncSubscription. Los
// métodos del driver se sustituyen con mock.method; la firma del webhook es la de verdad, con un secreto inventado.
// Las variables se fijan antes de que before() importe `app` (config/env.ts las lee al cargarse).
const WEBHOOK_SECRET = 'whsec_koma-tests-sync';
process.env.PAYMENTS_DRIVER = 'stripe';
process.env.STRIPE_SECRET_KEY = 'sk_test_koma-tests-falsa';
process.env.STRIPE_PRICE_ID = 'price_koma-tests';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

const srv = startTestServer();
const RUN = randomBytes(3).toString('hex');
const db = async () => (await import('../../db/pool.js')).pool;

type Fn = (...args: never[]) => unknown;
let driver: PaymentsDriver;
let mocks: Record<'createCustomer' | 'createCheckout' | 'createPortal' | 'retrieveSubscription', Mock<Fn>>;
// Estado "en Stripe" de cada suscripción, que devuelve retrieveSubscription.
const remote = new Map<string, SubscriptionSnapshot>();
let unavailable = false;

before(async () => {
  const mod = await import('../../integrations/payments/index.js');
  const { PaymentsUnavailableError } = await import('../../integrations/payments/driver.js');
  const { mock } = await import('node:test');
  driver = mod.payments;
  let customers = 0;
  mocks = {
    createCustomer: mock.method(driver, 'createCustomer', async () => `cus_${RUN}_${++customers}`) as unknown as Mock<Fn>,
    createCheckout: mock.method(driver, 'createCheckout', async ({ customerId }: { customerId: string | null }) =>
      `https://checkout.stripe.com/c/pay/${customerId}`,
    ) as unknown as Mock<Fn>,
    createPortal: mock.method(driver, 'createPortal', async (customerId: string | null) => `https://billing.stripe.com/p/session/${customerId}`) as unknown as Mock<Fn>,
    retrieveSubscription: mock.method(driver, 'retrieveSubscription', async (id: string) => {
      if (unavailable) throw new PaymentsUnavailableError('StripeConnectionError');
      const snapshot = remote.get(id);
      if (!snapshot) throw new Error(`sin suscripción ${id}`);
      return snapshot;
    }) as unknown as Mock<Fn>,
  };
});

beforeEach(() => {
  unavailable = false;
  for (const m of Object.values(mocks)) m.mock.resetCalls();
});

// --- Checkout y portal ---

test('RN-04: el checkout crea el cliente de Stripe una sola vez, lo guarda y devuelve la URL de Checkout', async () => {
  const reader = await createUser('reader');
  const first = await api(srv, 'POST', '/api/payments/checkout', { cookie: reader.cookie });
  assert.equal(first.status, 200);
  const { url } = (await first.json()) as { url: string };
  const { rows } = await (await db()).query<{ stripe_customer_id: string }>('SELECT stripe_customer_id FROM users WHERE id = $1', [reader.id]);
  const customerId = rows[0]!.stripe_customer_id;
  assert.match(customerId, /^cus_/);
  assert.equal(url, `https://checkout.stripe.com/c/pay/${customerId}`);

  const second = await api(srv, 'POST', '/api/payments/checkout', { cookie: reader.cookie });
  assert.equal(second.status, 200);
  assert.equal(mocks.createCustomer.mock.callCount(), 1, 'el segundo checkout reutiliza el cliente');
  assert.equal(mocks.createCheckout.mock.callCount(), 2);
});

test('RN-04: el checkout exige sesión, no es para el admin ni para quien ya es premium', async () => {
  assert.equal((await api(srv, 'POST', '/api/payments/checkout')).status, 401);
  const admin = await createUser('admin');
  const forbidden = await api(srv, 'POST', '/api/payments/checkout', { cookie: admin.cookie });
  assert.equal(forbidden.status, 403);
  assert.equal(((await forbidden.json()) as { code: string }).code, 'FORBIDDEN');
  const premium = await createUser('premium');
  const conflict = await api(srv, 'POST', '/api/payments/checkout', { cookie: premium.cookie });
  assert.equal(conflict.status, 409);
  assert.equal(((await conflict.json()) as { code: string }).code, 'CONFLICT');
  assert.equal(mocks.createCustomer.mock.callCount(), 0);
});

test('Seguridad: si Stripe no responde, el checkout da 503 SERVICE_UNAVAILABLE con un mensaje fijo', async () => {
  const { PaymentsUnavailableError } = await import('../../integrations/payments/driver.js');
  mocks.createCheckout.mock.mockImplementationOnce((async () => {
    throw new PaymentsUnavailableError('StripeConnectionError');
  }) as unknown as Fn);
  const reader = await createUser('reader');
  const res = await api(srv, 'POST', '/api/payments/checkout', { cookie: reader.cookie });
  assert.equal(res.status, 503);
  const json = (await res.json()) as { code: string; message: string };
  assert.deepEqual([json.code, json.message], ['SERVICE_UNAVAILABLE', 'El proveedor de pagos no responde']);
});

test('RN-04: el portal exige un cliente de Stripe guardado (409) y devuelve la URL del portal', async () => {
  const reader = await createUser('reader');
  const none = await api(srv, 'POST', '/api/payments/portal', { cookie: reader.cookie });
  assert.equal(none.status, 409);
  await (await db()).query('UPDATE users SET stripe_customer_id = $2 WHERE id = $1', [reader.id, `cus_${RUN}_portal`]);
  const res = await api(srv, 'POST', '/api/payments/portal', { cookie: reader.cookie });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { url: `https://billing.stripe.com/p/session/cus_${RUN}_portal` });
  assert.equal((await api(srv, 'POST', '/api/payments/portal')).status, 401);
});

test('Seguridad: con el driver stripe no existe el pago simulado (404)', async () => {
  const reader = await createUser('reader');
  assert.equal((await api(srv, 'POST', '/api/payments/fake/pay', { cookie: reader.cookie })).status, 404);
  assert.equal((await fetch(`${srv.baseUrl}/pago-simulado`, { headers: { Cookie: reader.cookie }, redirect: 'manual' })).status, 404);
});

// --- Webhook y syncSubscription ---

let events = 0;
function signedEvent(type: string, object: Record<string, unknown>, options: { id?: string; livemode?: boolean } = {}) {
  const payload = JSON.stringify({
    id: options.id ?? `evt_${RUN}_${++events}`,
    object: 'event',
    api_version: '2026-10-28.endive',
    created: Math.floor(Date.now() / 1000),
    livemode: options.livemode ?? false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { payload, signature, id: JSON.parse(payload).id as string };
}

function postEvent(event: { payload: string; signature: string }) {
  return fetch(`${srv.baseUrl}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': event.signature },
    body: event.payload,
  });
}

const DAY = 86_400_000;
const periodEnd = (days: number) => new Date(Math.floor((Date.now() + days * DAY) / 1000) * 1000);

// Suscriptor con cliente de Stripe guardado y su suscripción "en Stripe".
async function subscriber() {
  const user = await createUser('reader');
  const customerId = `cus_${RUN}_sub_${user.id}`;
  const subscriptionId = `sub_${RUN}_${user.id}`;
  await (await db()).query('UPDATE users SET stripe_customer_id = $2 WHERE id = $1', [user.id, customerId]);
  const set = (state: Partial<SubscriptionSnapshot>) =>
    remote.set(subscriptionId, {
      providerSubscriptionId: subscriptionId,
      customerId,
      status: 'active',
      currentPeriodEnd: periodEnd(30),
      cancelAtPeriodEnd: false,
      ...remote.get(subscriptionId),
      ...state,
    });
  return { ...user, customerId, subscriptionId, set };
}

async function state(userId: number) {
  const pool = await db();
  const { rows: users } = await pool.query<{ premium_until: Date | null }>('SELECT premium_until FROM users WHERE id = $1', [userId]);
  const { rows: subs } = await pool.query<{ id: number; status: string; current_period_end: Date; cancel_at_period_end: boolean }>(
    'SELECT id, status, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = $1',
    [userId],
  );
  const { rows: audits } = await pool.query<{ action: string; actor_id: number | null; before: unknown; after: unknown; ip: string | null }>(
    `SELECT action, actor_id, before, after, host(ip) AS ip FROM audit_log
     WHERE entity_type = 'subscriptions' AND entity_id = ANY($1::text[]) ORDER BY id`,
    [subs.map((sub) => String(sub.id))],
  );
  return { premiumUntil: users[0]!.premium_until, subs, audits };
}

test('RN-04: customer.subscription.created de un cliente de Koma crea la suscripción, da premium y audita subscription.start', async () => {
  const user = await subscriber();
  user.set({});
  const res = await postEvent(signedEvent('customer.subscription.created', { id: user.subscriptionId, object: 'subscription' }));
  assert.equal(res.status, 200);
  const { premiumUntil, subs, audits } = await state(user.id);
  assert.equal(subs.length, 1);
  assert.equal(subs[0]!.status, 'active');
  assert.equal(premiumUntil?.getTime(), remote.get(user.subscriptionId)!.currentPeriodEnd.getTime());
  assert.deepEqual(audits, [
    {
      action: 'subscription.start',
      actor_id: null,
      before: null,
      after: { status: 'active', currentPeriodEnd: premiumUntil!.toISOString(), cancelAtPeriodEnd: false, provider: 'stripe', userId: user.id },
      ip: null,
    },
  ]);
  // Ningún id de Stripe en la auditoría.
  assert.ok(!JSON.stringify(audits).includes('sub_') && !JSON.stringify(audits).includes('cus_'));

  const me = await api(srv, 'GET', '/api/me', { cookie: user.cookie });
  assert.equal(((await me.json()) as { user: { isPremium: boolean } }).user.isPremium, true);
  const sub = await api(srv, 'GET', '/api/payments/subscription', { cookie: user.cookie });
  assert.deepEqual(await sub.json(), {
    subscription: { provider: 'stripe', status: 'active', currentPeriodEnd: premiumUntil!.toISOString(), cancelAtPeriodEnd: false },
  });
});

test('RN-04: un evento repetido (mismo id) se responde con 200 y no se vuelve a aplicar ni a consultar en Stripe', async () => {
  const user = await subscriber();
  user.set({});
  const event = signedEvent('customer.subscription.created', { id: user.subscriptionId, object: 'subscription' });
  assert.equal((await postEvent(event)).status, 200);
  user.set({ currentPeriodEnd: periodEnd(60) }); // si se aplicara otra vez, sería una renovación
  assert.equal((await postEvent(event)).status, 200);
  assert.equal(mocks.retrieveSubscription.mock.callCount(), 1);
  const { audits } = await state(user.id);
  assert.deepEqual(audits.map((a) => a.action), ['subscription.start']);
  const { rows } = await (await db()).query('SELECT 1 FROM payment_events WHERE id = $1', [event.id]);
  assert.equal(rows.length, 1);
});

test('RN-04: invoice.paid renueva, la cancelación del portal es cancel, deshacerla es resume y el borrado es expire', async () => {
  const user = await subscriber();
  const sub = { id: user.subscriptionId, object: 'subscription' };
  const invoice = { object: 'invoice', parent: { subscription_details: { subscription: user.subscriptionId } } };
  user.set({});
  await postEvent(signedEvent('checkout.session.completed', { object: 'checkout.session', mode: 'subscription', subscription: user.subscriptionId }));

  user.set({ currentPeriodEnd: periodEnd(60) });
  assert.equal((await postEvent(signedEvent('invoice.paid', invoice))).status, 200);
  user.set({ cancelAtPeriodEnd: true });
  await postEvent(signedEvent('customer.subscription.updated', sub));
  user.set({ cancelAtPeriodEnd: false });
  await postEvent(signedEvent('customer.subscription.updated', sub));
  // Un evento sin cambios no escribe nada.
  await postEvent(signedEvent('customer.subscription.updated', sub));
  user.set({ status: 'canceled' });
  await postEvent(signedEvent('customer.subscription.deleted', sub));

  const { premiumUntil, subs, audits } = await state(user.id);
  assert.deepEqual(
    audits.map((a) => a.action),
    ['subscription.start', 'subscription.renew', 'subscription.cancel', 'subscription.resume', 'subscription.expire'],
  );
  assert.deepEqual(audits[2]!.before, { cancelAtPeriodEnd: false });
  assert.deepEqual(audits[4]!.after, { status: 'canceled' });
  assert.equal(subs[0]!.status, 'canceled');
  assert.equal(premiumUntil, null, 'sin suscripciones active, premium_until vuelve a NULL');
});

test('RN-04: invoice.payment_failed con la suscripción en past_due quita premium (D13)', async () => {
  const user = await subscriber();
  user.set({});
  await postEvent(signedEvent('customer.subscription.created', { id: user.subscriptionId, object: 'subscription' }));
  user.set({ status: 'past_due' });
  await postEvent(signedEvent('invoice.payment_failed', { object: 'invoice', parent: { subscription_details: { subscription: user.subscriptionId } } }));
  const { premiumUntil, audits } = await state(user.id);
  assert.deepEqual(audits.map((a) => a.action), ['subscription.start', 'subscription.expire']);
  assert.equal(premiumUntil, null);
});

test('RN-04: un cliente que no es de Koma registra el evento y responde 200 sin crear nada (D20)', async () => {
  const subscriptionId = `sub_${RUN}_ajena`;
  remote.set(subscriptionId, { providerSubscriptionId: subscriptionId, customerId: `cus_${RUN}_ajeno`, status: 'active', currentPeriodEnd: periodEnd(30), cancelAtPeriodEnd: false });
  const event = signedEvent('customer.subscription.created', { id: subscriptionId, object: 'subscription' });
  assert.equal((await postEvent(event)).status, 200);
  const pool = await db();
  assert.equal((await pool.query('SELECT 1 FROM subscriptions WHERE provider_subscription_id = $1', [subscriptionId])).rows.length, 0);
  assert.equal((await pool.query('SELECT 1 FROM payment_events WHERE id = $1', [event.id])).rows.length, 1);
});

test('RN-04: un evento en modo real, uno de otro tipo o uno sin suscripción no consultan Stripe ni se registran', async () => {
  const user = await subscriber();
  user.set({});
  const cases = [
    signedEvent('customer.subscription.created', { id: user.subscriptionId, object: 'subscription' }, { livemode: true }),
    signedEvent('customer.created', { id: user.customerId, object: 'customer' }),
    signedEvent('checkout.session.completed', { object: 'checkout.session', mode: 'payment', subscription: null }),
  ];
  for (const event of cases) {
    const res = await postEvent(event);
    assert.equal(res.status, 200);
    assert.equal((await (await db()).query('SELECT 1 FROM payment_events WHERE id = $1', [event.id])).rows.length, 0);
  }
  assert.equal(mocks.retrieveSubscription.mock.callCount(), 0);
  assert.equal((await state(user.id)).subs.length, 0);
});

test('RN-04: si Stripe no responde, el webhook da 503 sin registrar el evento, y el reintento de Stripe lo aplica', async () => {
  const user = await subscriber();
  user.set({});
  const event = signedEvent('customer.subscription.created', { id: user.subscriptionId, object: 'subscription' });
  unavailable = true;
  const failed = await postEvent(event);
  assert.equal(failed.status, 503);
  assert.equal(((await failed.json()) as { code: string }).code, 'SERVICE_UNAVAILABLE');
  assert.equal((await (await db()).query('SELECT 1 FROM payment_events WHERE id = $1', [event.id])).rows.length, 0);
  unavailable = false;
  assert.equal((await postEvent(event)).status, 200);
  assert.deepEqual((await state(user.id)).audits.map((a) => a.action), ['subscription.start']);
});
