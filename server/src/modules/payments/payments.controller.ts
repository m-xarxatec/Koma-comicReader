import type { Request, Response } from 'express';
import * as paymentsService from './payments.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio.

// Stripe solo mira el código: cualquier 2xx da la entrega por buena; el resto la reintenta.
export function stripeWebhook(req: Request, res: Response): void {
  paymentsService.handleStripeWebhook(req.body, req.get('stripe-signature'), { requestId: res.locals.requestId });
  res.json({ received: true });
}
