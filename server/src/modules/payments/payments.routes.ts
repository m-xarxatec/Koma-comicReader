import express, { Router } from 'express';
import { env, JSON_BODY_LIMIT } from '../../config/env.js';
import { requireAuth, requirePageAuth } from '../../middlewares/roles.js';
import * as controller from './payments.controller.js';

// Webhook de Stripe (contratos de la API de los bloques 1 y 4, docs/plan_mvp.md). Solo se monta con
// PAYMENTS_DRIVER=stripe. Va en app.ts después de requestId (sus líneas de log comparten requestId) y
// antes de csrf (exento: se valida por firma), de auth (no hay sesión: lo envía Stripe) y de los express.json: la
// firma se calcula sobre el cuerpo tal como llega, así que no puede leerlo antes ningún parser JSON. Límite: el
// general (JSON_BODY_LIMIT); más → 413 PAYLOAD_TOO_LARGE.
export const paymentsWebhookRouter = Router();

paymentsWebhookRouter.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json', limit: JSON_BODY_LIMIT }),
  controller.stripeWebhook,
);

// Contrato del bloque 4, "Premium". Se monta en /api, después de `auth`. Ninguna ruta lleva cuerpo.
export const paymentsRouter = Router();

paymentsRouter.get('/payments/subscription', requireAuth, controller.getSubscription);
paymentsRouter.post('/payments/checkout', requireAuth, controller.checkout);
paymentsRouter.post('/payments/portal', requireAuth, controller.portal);
// Pago simulado: solo con el driver fake (env.ts lo rechaza en producción); con stripe, 404.
if (env.PAYMENTS_DRIVER === 'fake') {
  paymentsRouter.post('/payments/fake/pay', requireAuth, controller.fakePay);
  paymentsRouter.post('/payments/fake/cancel', requireAuth, controller.fakeCancel);
}

// Páginas del mapa de rutas HTML. Se montan en la raíz, después de `auth`.
export const paymentsPagesRouter = Router();

paymentsPagesRouter.get('/premium', controller.premiumPage);
paymentsPagesRouter.get('/premium/gracias', requirePageAuth, controller.premiumThanksPage);
if (env.PAYMENTS_DRIVER === 'fake') paymentsPagesRouter.get('/pago-simulado', requirePageAuth, controller.fakeCheckoutPage);
