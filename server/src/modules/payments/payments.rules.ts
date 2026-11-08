import type Stripe from 'stripe';

// Reglas puras de la suscripción premium (RN-04; contrato de la API del bloque 4, "Webhook de Stripe y
// syncSubscription"). Sin BD, sin red y sin `env`: los tests unitarios las llaman directamente.

export const SUBSCRIPTION_STATUSES = [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export type PaymentsProvider = 'stripe' | 'fake';

// Lo que guarda `subscriptions` de una suscripción y lo que decide las transiciones.
export interface SubscriptionState {
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

// Una suscripción tal como la da el proveedor (Stripe o el pago simulado).
export interface SubscriptionSnapshot extends SubscriptionState {
  providerSubscriptionId: string;
  customerId: string | null; // cliente de Stripe; null en fake
}

export type SubscriptionAction =
  | 'subscription.start'
  | 'subscription.renew'
  | 'subscription.cancel'
  | 'subscription.resume'
  | 'subscription.expire';

// Tabla de transiciones del contrato. Solo cuenta como premium `active` (RN-04): de active a cualquier otro estado
// (past_due incluido, D13) es expire; de cualquier otro a active, start. Con la suscripción active en los dos
// lados: renew si avanza el fin de periodo, cancel o resume si cambia cancelAtPeriodEnd (D14). Puede haber
// varias a la vez (renovar y cancelar en el mismo evento).
export function subscriptionTransitions(before: SubscriptionState | null, after: SubscriptionState): SubscriptionAction[] {
  const wasActive = before?.status === 'active';
  const isActive = after.status === 'active';
  if (!wasActive) return isActive ? ['subscription.start'] : [];
  if (!isActive) return ['subscription.expire'];
  const actions: SubscriptionAction[] = [];
  if (after.currentPeriodEnd.getTime() > before.currentPeriodEnd.getTime()) actions.push('subscription.renew');
  if (!before.cancelAtPeriodEnd && after.cancelAtPeriodEnd) actions.push('subscription.cancel');
  if (before.cancelAtPeriodEnd && !after.cancelAtPeriodEnd) actions.push('subscription.resume');
  return actions;
}

export function sameState(a: SubscriptionState, b: SubscriptionState): boolean {
  return a.status === b.status && a.currentPeriodEnd.getTime() === b.currentPeriodEnd.getTime() && a.cancelAtPeriodEnd === b.cancelAtPeriodEnd;
}

interface StateFields {
  status?: SubscriptionStatus;
  currentPeriodEnd?: string; // ISO 8601
  cancelAtPeriodEnd?: boolean;
}

// before/after de la auditoría: solo los campos que cambian. Sin fila previa, before es null y after lleva todo.
export function changedFields(before: SubscriptionState | null, after: SubscriptionState): { before: StateFields | null; after: StateFields } {
  const full = (state: SubscriptionState): StateFields => ({
    status: state.status,
    currentPeriodEnd: state.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
  });
  if (before === null) return { before: null, after: full(after) };
  const was: StateFields = {};
  const now: StateFields = {};
  if (before.status !== after.status) [was.status, now.status] = [before.status, after.status];
  if (before.currentPeriodEnd.getTime() !== after.currentPeriodEnd.getTime()) {
    [was.currentPeriodEnd, now.currentPeriodEnd] = [before.currentPeriodEnd.toISOString(), after.currentPeriodEnd.toISOString()];
  }
  if (before.cancelAtPeriodEnd !== after.cancelAtPeriodEnd) {
    [was.cancelAtPeriodEnd, now.cancelAtPeriodEnd] = [before.cancelAtPeriodEnd, after.cancelAtPeriodEnd];
  }
  return { before: was, after: now };
}

// modelo_datos.md (009): el current_period_end mayor entre las suscripciones active del usuario, o NULL.
export function premiumUntilFrom(subscriptions: readonly SubscriptionState[]): Date | null {
  let max: Date | null = null;
  for (const sub of subscriptions) {
    if (sub.status === 'active' && (max === null || sub.currentPeriodEnd.getTime() > max.getTime())) max = sub.currentPeriodEnd;
  }
  return max;
}

// La suscripción que muestra GET /api/payments/subscription: la active con el fin de periodo mayor; si no hay,
// la más reciente (la lista llega de la más reciente a la más antigua).
export function currentSubscription<T extends SubscriptionState>(newestFirst: readonly T[]): T | null {
  let best: T | null = null;
  for (const sub of newestFirst) {
    if (sub.status === 'active' && (best === null || sub.currentPeriodEnd.getTime() > best.currentPeriodEnd.getTime())) best = sub;
  }
  return best ?? newestFirst[0] ?? null;
}

const unixToDate = (seconds: number) => new Date(seconds * 1000);
const idOf = (value: string | { id: string } | null | undefined): string | null => (value == null ? null : typeof value === 'string' ? value : value.id);

// Trampa de Stripe: current_period_end está en items.data[0], no en la suscripción. La cancelación al fin de
// periodo llega como cancel_at_period_end o, desde el portal en versiones recientes, como cancel_at.
export function snapshotFromStripe(subscription: Stripe.Subscription): SubscriptionSnapshot {
  const item = subscription.items.data[0];
  if (!item) throw new Error(`La suscripción ${subscription.id} no tiene elementos`);
  const { status } = subscription;
  if (!isSubscriptionStatus(status)) throw new Error(`Estado de suscripción desconocido: ${status}`);
  return {
    providerSubscriptionId: subscription.id,
    customerId: idOf(subscription.customer),
    status,
    currentPeriodEnd: unixToDate(item.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end || subscription.cancel_at !== null,
  };
}

// Los seis eventos del plan ("Stripe online"). El resto se responde con 200 sin tocar nada.
export const HANDLED_EVENT_TYPES = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
] as const;

// Id de la suscripción de un evento (paso 3 del recorrido), o null si no trae ninguna o no es de los seis.
export function subscriptionIdFromEvent(event: Stripe.Event): string | null {
  switch (event.type) {
    case 'checkout.session.completed':
      return event.data.object.mode === 'subscription' ? idOf(event.data.object.subscription) : null;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return event.data.object.id;
    case 'invoice.paid':
    case 'invoice.payment_failed':
      return idOf(event.data.object.parent?.subscription_details?.subscription);
    default:
      return null;
  }
}
