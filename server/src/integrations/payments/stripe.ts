import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { AppError, INTERNAL_ERROR_MESSAGE } from '../../utils/app-error.js';

// Driver `stripe` (bloque 1: solo la prueba mínima del webhook). La verificación de la firma es estática:
// no necesita el cliente ni la clave secreta. El cliente, con `apiVersion` fijada en el constructor
// (la del SDK, '2026-10-28.endive'), llega en el bloque 4 con Checkout, el portal y syncSubscription (RN-04).

export type StripeEvent = Stripe.Event;

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
