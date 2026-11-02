import { isSignatureError, verifyWebhookEvent, type StripeEvent } from '../../integrations/payments/stripe.js';
import { AppError, INTERNAL_ERROR_MESSAGE } from '../../utils/app-error.js';
import { logger } from '../../utils/logger.js';

export interface WebhookContext {
  requestId: string;
}

const INVALID_SIGNATURE = 'Firma del webhook no válida';
const SIGNED_BODY_NOT_JSON = 'El cuerpo firmado no es JSON válido'; // solo para el log

// 400 sin procesar nada. El warn lleva solo el motivo; nunca la cabecera Stripe-Signature ni el cuerpo
// (tampoco como `cause`: el error de Stripe los guarda dentro).
function rejectSignature(ctx: WebhookContext, reason: string): never {
  logger.warn(INVALID_SIGNATURE, { requestId: ctx.requestId, reason });
  throw new AppError(400, 'VALIDATION_ERROR', INVALID_SIGNATURE);
}

// Prueba mínima del bloque 1: verifica la firma y registra el evento. Sin BD: la tabla payment_events
// (idempotencia) y syncSubscription (RN-04) llegan en el bloque 4. Del evento solo se registran id, tipo,
// livemode y versión de API: el cuerpo lleva correos y datos del cliente.
export function handleStripeWebhook(payload: unknown, signature: string | undefined, ctx: WebhookContext): StripeEvent {
  // Sin cuerpo JSON, express.raw no deja un Buffer (otro Content-Type o cuerpo vacío).
  if (!Buffer.isBuffer(payload)) rejectSignature(ctx, 'El cuerpo no llegó como JSON crudo');
  if (!signature) rejectSignature(ctx, 'Falta la cabecera Stripe-Signature');

  let event: StripeEvent;
  try {
    event = verifyWebhookEvent(payload, signature);
  } catch (err) {
    if (isSignatureError(err)) rejectSignature(ctx, err.message);
    if (err instanceof AppError) throw err; // falta STRIPE_WEBHOOK_SECRET: ya es un 500 con su causa
    // Cualquier otro fallo es nuestro: 500 genérico; el original va en `cause`, solo al log. Aquí ya no llega
    // el error de firma, el único que guarda la cabecera y el cuerpo. Excepción: el SyntaxError de JSON.parse
    // (cuerpo bien firmado que no es JSON) copia un trozo del cuerpo en su mensaje; en su lugar, uno fijo.
    const cause = err instanceof SyntaxError ? new Error(SIGNED_BODY_NOT_JSON) : err;
    throw new AppError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE, { cause });
  }

  logger.info('Webhook de Stripe verificado', {
    requestId: ctx.requestId,
    eventId: event.id,
    type: event.type,
    livemode: event.livemode,
    apiVersion: event.api_version,
  });
  return event;
}
