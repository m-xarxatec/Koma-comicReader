import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Stripe from 'stripe';
import {
  changedFields,
  currentSubscription,
  premiumUntilFrom,
  snapshotFromStripe,
  subscriptionIdFromEvent,
  subscriptionTransitions,
  type SubscriptionState,
} from '../../modules/payments/payments.rules.js';

// Reglas puras de RN-04 (contrato del bloque 4, "Webhook de Stripe y syncSubscription").

const NOV = new Date('2026-11-30T10:00:00Z');
const DEC = new Date('2026-12-30T10:00:00Z');
const active: SubscriptionState = { status: 'active', currentPeriodEnd: NOV, cancelAtPeriodEnd: false };

test('RN-04: sin fila o desde un estado no activo, pasar a active es subscription.start', () => {
  assert.deepEqual(subscriptionTransitions(null, active), ['subscription.start']);
  assert.deepEqual(subscriptionTransitions({ ...active, status: 'incomplete' }, active), ['subscription.start']);
  assert.deepEqual(subscriptionTransitions({ ...active, status: 'past_due' }, active), ['subscription.start']);
});

test('RN-04: una suscripción que nace o sigue sin estar activa no genera entradas', () => {
  assert.deepEqual(subscriptionTransitions(null, { ...active, status: 'incomplete' }), []);
  assert.deepEqual(subscriptionTransitions({ ...active, status: 'incomplete' }, { ...active, status: 'incomplete_expired' }), []);
});

test('RN-04: con active en los dos lados, avanzar el fin de periodo es renew; sin cambios, nada', () => {
  assert.deepEqual(subscriptionTransitions(active, { ...active, currentPeriodEnd: DEC }), ['subscription.renew']);
  assert.deepEqual(subscriptionTransitions(active, active), []);
  // Un fin de periodo anterior (no debería pasar) no es renovación.
  assert.deepEqual(subscriptionTransitions({ ...active, currentPeriodEnd: DEC }, active), []);
});

test('RN-04: cancelar al fin de periodo es cancel y deshacerlo en el portal es resume (D14)', () => {
  const canceled = { ...active, cancelAtPeriodEnd: true };
  assert.deepEqual(subscriptionTransitions(active, canceled), ['subscription.cancel']);
  assert.deepEqual(subscriptionTransitions(canceled, active), ['subscription.resume']);
  assert.deepEqual(subscriptionTransitions(active, { ...canceled, currentPeriodEnd: DEC }), ['subscription.renew', 'subscription.cancel']);
});

test('RN-04: de active a cualquier otro estado es expire, también past_due (D13)', () => {
  for (const status of ['past_due', 'canceled', 'unpaid', 'paused', 'incomplete_expired'] as const) {
    assert.deepEqual(subscriptionTransitions(active, { ...active, status }), ['subscription.expire'], status);
  }
});

test('RN-04: la auditoría lleva solo los campos que cambian, con fechas ISO', () => {
  assert.deepEqual(changedFields(null, active), {
    before: null,
    after: { status: 'active', currentPeriodEnd: NOV.toISOString(), cancelAtPeriodEnd: false },
  });
  assert.deepEqual(changedFields(active, { ...active, cancelAtPeriodEnd: true }), {
    before: { cancelAtPeriodEnd: false },
    after: { cancelAtPeriodEnd: true },
  });
  assert.deepEqual(changedFields(active, { ...active, status: 'canceled', currentPeriodEnd: DEC }), {
    before: { status: 'active', currentPeriodEnd: NOV.toISOString() },
    after: { status: 'canceled', currentPeriodEnd: DEC.toISOString() },
  });
});

test('RN-04: premium_until es el fin de periodo mayor de las active, o null', () => {
  assert.equal(premiumUntilFrom([]), null);
  assert.equal(premiumUntilFrom([{ ...active, status: 'canceled', currentPeriodEnd: DEC }]), null);
  assert.equal(premiumUntilFrom([active, { ...active, currentPeriodEnd: DEC }]), DEC);
  assert.equal(premiumUntilFrom([active, { ...active, status: 'past_due', currentPeriodEnd: DEC }]), NOV);
});

test('RN-04: la suscripción que se muestra es la active de fin mayor o, si no hay, la más reciente', () => {
  const old = { ...active, id: 1 };
  const newer = { ...active, id: 2, currentPeriodEnd: DEC };
  const canceledNewest = { ...active, id: 3, status: 'canceled' as const };
  assert.equal(currentSubscription([canceledNewest, newer, old])?.id, 2);
  assert.equal(currentSubscription([canceledNewest, { ...old, status: 'canceled' as const }])?.id, 3);
  assert.equal(currentSubscription([]), null);
});

function stripeSubscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  const value = {
    id: 'sub_123',
    object: 'subscription',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: null,
    items: { data: [{ current_period_end: Math.floor(DEC.getTime() / 1000) }] },
    ...overrides,
  };
  return value as unknown as Stripe.Subscription;
}

test('RN-04: de Stripe, el fin de periodo sale de items.data[0] y cancel_at también cuenta como cancelación', () => {
  assert.deepEqual(snapshotFromStripe(stripeSubscription()), {
    providerSubscriptionId: 'sub_123',
    customerId: 'cus_123',
    status: 'active',
    currentPeriodEnd: DEC,
    cancelAtPeriodEnd: false,
  });
  assert.equal(snapshotFromStripe(stripeSubscription({ cancel_at_period_end: true })).cancelAtPeriodEnd, true);
  assert.equal(snapshotFromStripe(stripeSubscription({ cancel_at: 1798000000 })).cancelAtPeriodEnd, true);
  assert.equal(snapshotFromStripe(stripeSubscription({ customer: { id: 'cus_obj' } })).customerId, 'cus_obj');
  assert.throws(() => snapshotFromStripe(stripeSubscription({ items: { data: [] } })));
  assert.throws(() => snapshotFromStripe(stripeSubscription({ status: 'otro' })));
});

const event = (type: string, object: Record<string, unknown>) => ({ id: 'evt_1', type, data: { object } }) as unknown as Stripe.Event;

test('RN-04: el id de la suscripción sale de cada uno de los seis eventos; el resto no tiene', () => {
  assert.equal(subscriptionIdFromEvent(event('checkout.session.completed', { mode: 'subscription', subscription: 'sub_a' })), 'sub_a');
  assert.equal(subscriptionIdFromEvent(event('checkout.session.completed', { mode: 'payment', subscription: null })), null);
  for (const type of ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']) {
    assert.equal(subscriptionIdFromEvent(event(type, { id: 'sub_b' })), 'sub_b', type);
  }
  const invoice = { parent: { subscription_details: { subscription: 'sub_c' } } };
  assert.equal(subscriptionIdFromEvent(event('invoice.paid', invoice)), 'sub_c');
  assert.equal(subscriptionIdFromEvent(event('invoice.payment_failed', invoice)), 'sub_c');
  assert.equal(subscriptionIdFromEvent(event('invoice.paid', { parent: null })), null);
  assert.equal(subscriptionIdFromEvent(event('customer.created', { id: 'cus_x' })), null);
});
