import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { snapshotFromStripe } from '../../modules/payments/payments.rules.js';
import { AppError, INTERNAL_ERROR_MESSAGE } from '../../utils/app-error.js';
import { PaymentsUnavailableError, type PaymentsDriver } from './driver.js';

// Driver `stripe` (modo prueba). La verificación de la firma del webhook es estática (bloque 1); el cliente, con
// `apiVersion` fijada en el constructor, sirve a Checkout, al portal y a syncSubscription (bloque 4, RN-04).

export type StripeEvent = Stripe.Event;

// La del SDK fijado (23.1.0) y la del destino del webhook en Workbench ("Primer despliegue", paso 7).
export const STRIPE_API_VERSION = '2026-10-28.endive';
const STRIPE_TIMEOUT_MS = 10_000;

// Firma ausente, mal formada, que no coincide o con la marca de tiempo fuera de la tolerancia.
// Ojo: este error guarda la cabecera y el cuerpo en sus propiedades `header` y `payload`; de él solo se
// puede registrar `message`, que son textos fijos del SDK.
export function isSignatureError(err: unknown): err is Error {
  return err instanceof Stripe.errors.StripeSignatureVerificationError;
}

// Comprueba la firma HMAC de `Stripe-Signature` sobre el cuerpo crudo con STRIPE_WEBHOOK_SECRET y devuelve
// el evento. Tolerancia de serie del SDK (5 min): una entrega antigua reenviada no pasa.
export function verifyWebhookEvent(payload: Buffer, signature: string): StripeEvent {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // env.ts la exige con PAYMENTS_DRIVER=stripe, y la ruta solo se monta con ese driver.
    throw new AppError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE, {
      cause: new Error('Webhook de Stripe sin STRIPE_WEBHOOK_SECRET'),
    });
  }
  return Stripe.webhooks.constructEvent(payload, signature, secret);
}

export interface StripeConfig {
  secretKey: string;
  priceId: string;
  appUrl: string; // origen de APP_URL: URLs de retorno absolutas (las únicas que salen de la app)
  testClockId: string | null; // contingencia nivel 1 (Test Clocks)
}

// Los errores del SDK guardan la petición y la respuesta: hacia fuera solo salen su tipo y su código.
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) throw new PaymentsUnavailableError(`${err.type}${err.code ? ` (${err.code})` : ''}`);
    throw err;
  }
}

export function createStripePayments(config: StripeConfig): PaymentsDriver {
  const stripe = new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION, timeout: STRIPE_TIMEOUT_MS, maxNetworkRetries: 1 });
  const url = (path: string) => new URL(path, config.appUrl).toString();

  return {
    name: 'stripe',

    async createCustomer({ userId, email }) {
      const customer = await call(() =>
        stripe.customers.create({
          email,
          metadata: { userId: String(userId) },
          ...(config.testClockId && { test_clock: config.testClockId }),
        }),
      );
      return customer.id;
    },

    async createCheckout({ userId, customerId }) {
      if (!customerId) throw new Error('Checkout de Stripe sin cliente');
      const session = await call(() =>
        stripe.checkout.sessions.create({
          mode: 'subscription',
          customer: customerId,
          line_items: [{ price: config.priceId, quantity: 1 }],
          client_reference_id: String(userId),
          subscription_data: { metadata: { userId: String(userId) } },
          locale: 'es',
          success_url: url('/premium/gracias'),
          cancel_url: url('/premium'),
        }),
      );
      if (!session.url) throw new PaymentsUnavailableError('Checkout sin URL');
      return session.url;
    },

    async createPortal(customerId) {
      if (!customerId) throw new Error('Portal de Stripe sin cliente');
      const session = await call(() => stripe.billingPortal.sessions.create({ customer: customerId, return_url: url('/perfil') }));
      return session.url;
    },

    async retrieveSubscription(id) {
      return snapshotFromStripe(await call(() => stripe.subscriptions.retrieve(id)));
    },
  };
}
