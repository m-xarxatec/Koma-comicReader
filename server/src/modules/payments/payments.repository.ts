import type { Queryable } from '../../db/pool.js';
import type { PaymentsProvider, SubscriptionState, SubscriptionStatus } from './payments.rules.js';

// Único lugar con SQL de `subscriptions` y `payment_events` (009_billing). Recibe un Queryable.

export interface Subscription extends SubscriptionState {
  id: number;
  userId: number;
  provider: PaymentsProvider;
  providerSubscriptionId: string; // nunca sale del servidor ni va a la auditoría
  createdAt: Date;
}

interface SubscriptionRow {
  id: number;
  user_id: number;
  provider: PaymentsProvider;
  provider_subscription_id: string;
  status: SubscriptionStatus;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  created_at: Date;
}

const COLUMNS = 'id, user_id, provider, provider_subscription_id, status, current_period_end, cancel_at_period_end, created_at';

function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerSubscriptionId: row.provider_subscription_id,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    createdAt: row.created_at,
  };
}

// Fila bloqueada hasta el final de la transacción (applySubscription compara el estado anterior con el nuevo).
export async function findByProviderIdForUpdate(db: Queryable, providerSubscriptionId: string): Promise<Subscription | null> {
  const { rows } = await db.query<SubscriptionRow>(
    `SELECT ${COLUMNS} FROM subscriptions WHERE provider_subscription_id = $1 FOR UPDATE`,
    [providerSubscriptionId],
  );
  return rows[0] ? toSubscription(rows[0]) : null;
}

export interface NewSubscription extends SubscriptionState {
  userId: number;
  provider: PaymentsProvider;
  providerSubscriptionId: string;
}

export async function insert(db: Queryable, sub: NewSubscription): Promise<Subscription> {
  const { rows } = await db.query<SubscriptionRow>(
    `INSERT INTO subscriptions (user_id, provider, provider_subscription_id, status, current_period_end, cancel_at_period_end)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [sub.userId, sub.provider, sub.providerSubscriptionId, sub.status, sub.currentPeriodEnd, sub.cancelAtPeriodEnd],
  );
  return toSubscription(rows[0]!);
}

export async function updateState(db: Queryable, id: number, state: SubscriptionState): Promise<Subscription> {
  const { rows } = await db.query<SubscriptionRow>(
    `UPDATE subscriptions SET status = $2, current_period_end = $3, cancel_at_period_end = $4
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, state.status, state.currentPeriodEnd, state.cancelAtPeriodEnd],
  );
  return toSubscription(rows[0]!);
}

// Todas las del usuario, de la más reciente a la más antigua.
export async function findByUser(db: Queryable, userId: number): Promise<Subscription[]> {
  const { rows } = await db.query<SubscriptionRow>(
    `SELECT ${COLUMNS} FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return rows.map(toSubscription);
}

// Idempotencia del webhook: true si el evento es nuevo (se acaba de registrar).
export async function recordEvent(db: Queryable, id: string, type: string): Promise<boolean> {
  const { rowCount } = await db.query('INSERT INTO payment_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [id, type]);
  return rowCount === 1;
}

export async function eventExists(db: Queryable, id: string): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM payment_events WHERE id = $1', [id]);
  return rows.length > 0;
}
