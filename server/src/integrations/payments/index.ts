import { env } from '../../config/env.js';
import type { PaymentsDriver } from './driver.js';
import { createFakePayments } from './fake.js';
import { createStripePayments } from './stripe.js';

// Driver activo según PAYMENTS_DRIVER. Los servicios lo usan siempre como `payments.metodo(...)`: así los tests
// sustituyen un método con mock.method(payments, 'retrieveSubscription', …) sin red.

export type { PaymentsDriver } from './driver.js';
export { PaymentsUnavailableError } from './driver.js';

export const payments: PaymentsDriver =
  env.PAYMENTS_DRIVER === 'stripe'
    ? createStripePayments({
        // env.ts exige las tres STRIPE_* con PAYMENTS_DRIVER=stripe: aquí nunca faltan.
        secretKey: env.STRIPE_SECRET_KEY!,
        priceId: env.STRIPE_PRICE_ID!,
        appUrl: new URL(env.APP_URL).origin,
        testClockId: env.STRIPE_TEST_CLOCK_ID ?? null,
      })
    : createFakePayments();
