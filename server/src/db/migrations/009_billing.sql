-- 009_billing · copiada de docs/modelo_datos.md (fuente de verdad del esquema).
-- syncSubscription (RN-04) actualiza `subscriptions` y recalcula users.premium_until en la misma transacción:
-- el current_period_end mayor entre las suscripciones `active` del usuario, o NULL.

CREATE TABLE subscriptions (
  id                       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id                  INTEGER NOT NULL REFERENCES users(id),
  provider                 TEXT NOT NULL CHECK (provider IN ('stripe', 'fake')),
  provider_subscription_id TEXT NOT NULL UNIQUE,        -- 'sub_…' o 'fake_<uuid>'
  status                   TEXT NOT NULL CHECK (status IN ('incomplete', 'incomplete_expired', 'trialing',
                             'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  current_period_end       TIMESTAMPTZ NOT NULL,
  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_user_idx ON subscriptions (user_id);
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payment_events (
  id          TEXT PRIMARY KEY,                         -- id del evento del proveedor
  type        TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()        -- hace de created_at
);
