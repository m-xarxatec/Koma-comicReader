import express, { Router } from 'express';
import { JSON_BODY_LIMIT } from '../../config/env.js';
import * as controller from './payments.controller.js';

// Webhook de Stripe (contrato de la API del bloque 1, docs/plan_mvp.md). Solo se monta con
// PAYMENTS_DRIVER=stripe. Va en app.ts después de requestId (sus dos líneas de log comparten requestId) y
// antes de csrf (exento: se valida por firma), de auth (no consulta la BD) y de los express.json: la firma
// se calcula sobre el cuerpo tal como llega, así que no puede leerlo antes ningún parser JSON. Límite: el
// general (JSON_BODY_LIMIT); más → 413 PAYLOAD_TOO_LARGE.
export const paymentsWebhookRouter = Router();

paymentsWebhookRouter.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json', limit: JSON_BODY_LIMIT }),
  controller.stripeWebhook,
);
