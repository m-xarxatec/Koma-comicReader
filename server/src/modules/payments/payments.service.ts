import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { FAKE_PREMIUM_DAYS } from '../../config/limits.js';
import { pool, withTransaction } from '../../db/pool.js';
import { payments, PaymentsUnavailableError } from '../../integrations/payments/index.js';
import { isSignatureError, verifyWebhookEvent, type StripeEvent } from '../../integrations/payments/stripe.js';
import { AppError, INTERNAL_ERROR_MESSAGE } from '../../utils/app-error.js';
import { logger } from '../../utils/logger.js';
import * as audit from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { canSubscribe, isPremium } from '../auth/permissions.js';
import * as usersRepository from '../users/users.repository.js';
import type { User } from '../users/users.repository.js';
import * as paymentsRepository from './payments.repository.js';
import type { Subscription } from './payments.repository.js';
import {
  changedFields,
  currentSubscription,
  HANDLED_EVENT_TYPES,
  premiumUntilFrom,
  sameState,
  subscriptionIdFromEvent,
  subscriptionTransitions,
  type PaymentsProvider,
  type SubscriptionAction,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
} from './payments.rules.js';

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

// Firma del bloque 1: verifica y devuelve el evento, o 400 sin procesar nada.
function verifyEvent(payload: unknown, signature: string | undefined, ctx: WebhookContext): StripeEvent {
  // Sin cuerpo JSON, express.raw no deja un Buffer (otro Content-Type o cuerpo vacío).
  if (!Buffer.isBuffer(payload)) rejectSignature(ctx, 'El cuerpo no llegó como JSON crudo');
  if (!signature) rejectSignature(ctx, 'Falta la cabecera Stripe-Signature');

  try {
    return verifyWebhookEvent(payload, signature);
  } catch (err) {
    if (isSignatureError(err)) rejectSignature(ctx, err.message);
    if (err instanceof AppError) throw err; // falta STRIPE_WEBHOOK_SECRET: ya es un 500 con su causa
    // Cualquier otro fallo es nuestro: 500 genérico; el original va en `cause`, solo al log. Aquí ya no llega
    // el error de firma, el único que guarda la cabecera y el cuerpo. Excepción: el SyntaxError de JSON.parse
    // (cuerpo bien firmado que no es JSON) copia un trozo del cuerpo en su mensaje; en su lugar, uno fijo.
    const cause = err instanceof SyntaxError ? new Error(SIGNED_BODY_NOT_JSON) : err;
    throw new AppError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE, { cause });
  }
}

export type WebhookOutcome = 'applied' | 'livemode' | 'ignored' | 'no_subscription' | 'duplicate' | 'unknown_customer';

const isHandled = (type: string): boolean => (HANDLED_EVENT_TYPES as readonly string[]).includes(type);

// Contrato del bloque 4, "Webhook de Stripe y syncSubscription" (pasos 1 a 7). Del evento solo van al log id,
// tipo, livemode, versión de API y las acciones aplicadas: el cuerpo lleva correos y datos del cliente. Cualquier
// fallo después de la firma (Stripe o la BD no responden) es un 5xx: Stripe reintenta la entrega.
export async function handleStripeWebhook(payload: unknown, signature: string | undefined, ctx: WebhookContext): Promise<WebhookOutcome> {
  const event = verifyEvent(payload, signature, ctx);
  const base = { requestId: ctx.requestId, eventId: event.id, type: event.type };
  logger.info('Webhook de Stripe verificado', { ...base, livemode: event.livemode, apiVersion: event.api_version });

  // 1. La clave es sk_test_: un evento en modo real no debería llegar nunca (D20).
  if (event.livemode) {
    logger.warn('Webhook de Stripe en modo real: se ignora', base);
    return 'livemode';
  }
  // 2 y 3. Solo los seis eventos del plan, y solo si traen una suscripción.
  if (!isHandled(event.type)) return 'ignored';
  const subscriptionId = subscriptionIdFromEvent(event);
  if (!subscriptionId) return 'no_subscription';
  // 4. Evento repetido: ya se procesó (idempotencia por payment_events).
  if (await paymentsRepository.eventExists(pool, event.id)) {
    logger.info('Webhook de Stripe repetido: se ignora', base);
    return 'duplicate';
  }
  // 5. Estado actual en Stripe, fuera de la transacción: el orden de llegada de los eventos no importa.
  const snapshot = await unavailable(() => payments.retrieveSubscription(subscriptionId));
  const user = snapshot.customerId ? await usersRepository.findByStripeCustomerId(pool, snapshot.customerId) : null;
  if (!user) {
    // Cliente que no es de Koma (p. ej. `stripe trigger`): se registra para no volver a pedirlo y 200 (D20).
    await paymentsRepository.recordEvent(pool, event.id, event.type);
    logger.warn('Webhook de Stripe de un cliente desconocido', base);
    return 'unknown_customer';
  }
  // 6. Usuario bloqueado (serializa sus eventos), evento registrado y suscripción aplicada, en una transacción.
  const actions = await withTransaction(async (client) => {
    await usersRepository.findByIdForUpdate(client, user.id);
    if (!(await paymentsRepository.recordEvent(client, event.id, event.type))) return null; // otro proceso se adelantó
    const result = await applySubscription(
      client,
      { userId: user.id, provider: 'stripe', snapshot },
      { kind: 'transitions', actorId: null, ip: null, requestId: ctx.requestId }, // actor NULL = sistema (D12)
    );
    return result.actions;
  });
  if (actions === null) {
    logger.info('Webhook de Stripe repetido: se ignora', base);
    return 'duplicate';
  }
  // 7.
  logger.info('Suscripción sincronizada', { ...base, userId: user.id, actions });
  return 'applied';
}

// --- Bloque 4: applySubscription, el núcleo de syncSubscription (RN-04) ---

// Cómo se audita: las transiciones de la tabla del contrato (webhook y pago simulado) o, desde el seed, una
// entrada system.seed por la fila creada (modelo_datos.md, "Seeds").
export type SubscriptionAudit =
  | { kind: 'transitions'; actorId: number | null; ip: string | null; requestId: string }
  | { kind: 'seed'; requestId: string };

export interface ApplySubscriptionInput {
  userId: number;
  provider: PaymentsProvider;
  snapshot: SubscriptionSnapshot;
}

export interface ApplySubscriptionResult {
  subscription: Subscription;
  actions: SubscriptionAction[];
  user: User; // con premium_until ya recalculado
}

const internal = (message: string) => new AppError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE, { cause: new Error(message) });

// Dentro de la transacción de quien llama (con el mismo client para la auditoría). Bloquea antes la fila del
// usuario: los eventos de un mismo usuario se aplican de uno en uno. Inserta o actualiza `subscriptions`,
// recalcula users.premium_until (el fin de periodo mayor de sus active, o NULL) y audita.
export async function applySubscription(
  client: PoolClient,
  input: ApplySubscriptionInput,
  how: SubscriptionAudit,
): Promise<ApplySubscriptionResult> {
  const user = await usersRepository.findByIdForUpdate(client, input.userId);
  if (!user) throw internal(`applySubscription: el usuario ${input.userId} no existe`);

  const { snapshot } = input;
  const existing = await paymentsRepository.findByProviderIdForUpdate(client, snapshot.providerSubscriptionId);
  if (existing && existing.userId !== input.userId) {
    throw internal(`applySubscription: la suscripción ${existing.id} es de otro usuario`);
  }

  let subscription: Subscription;
  if (!existing) {
    subscription = await paymentsRepository.insert(client, {
      userId: input.userId,
      provider: input.provider,
      providerSubscriptionId: snapshot.providerSubscriptionId,
      status: snapshot.status,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    });
  } else if (!sameState(existing, snapshot)) {
    subscription = await paymentsRepository.updateState(client, existing.id, snapshot);
  } else {
    subscription = existing;
  }

  const premiumUntil = premiumUntilFrom(await paymentsRepository.findByUser(client, input.userId));
  const updatedUser =
    (premiumUntil?.getTime() ?? null) === (user.premiumUntil?.getTime() ?? null)
      ? user
      : await usersRepository.updatePremiumUntil(client, input.userId, premiumUntil);

  const actions = subscriptionTransitions(existing, snapshot);
  const entityId = String(subscription.id);
  if (how.kind === 'seed') {
    if (!existing) {
      await audit.record(client, {
        action: 'system.seed',
        actorId: null,
        entityType: 'subscriptions',
        entityId,
        after: { id: subscription.id, userId: input.userId },
        ip: null,
        requestId: how.requestId,
      });
    }
  } else {
    const diff = changedFields(existing, snapshot);
    for (const action of actions) {
      const after = action === 'subscription.start' ? { ...diff.after, provider: input.provider, userId: input.userId } : diff.after;
      await audit.record(client, {
        action,
        actorId: how.actorId,
        entityType: 'subscriptions',
        entityId,
        before: diff.before,
        after,
        ip: how.ip,
        requestId: how.requestId,
      });
    }
  }

  return { subscription, actions, user: updatedUser };
}

// --- Bloque 4: suscripción, Checkout, portal y pago simulado (CU-21, CU-27) ---

const PROVIDER_UNAVAILABLE = 'El proveedor de pagos no responde';

// Errores del proveedor → 503; la causa (tipo y código de Stripe) solo va al log.
async function unavailable<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PaymentsUnavailableError) throw new AppError(503, 'SERVICE_UNAVAILABLE', PROVIDER_UNAVAILABLE, { cause: err });
    throw err;
  }
}

export interface SubscriptionDto {
  provider: PaymentsProvider;
  status: SubscriptionStatus;
  currentPeriodEnd: string; // ISO 8601
  cancelAtPeriodEnd: boolean;
}

export function toSubscriptionDto(sub: Subscription): SubscriptionDto {
  return {
    provider: sub.provider,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

export async function getSubscription(user: User): Promise<SubscriptionDto | null> {
  const current = currentSubscription(await paymentsRepository.findByUser(pool, user.id));
  return current ? toSubscriptionDto(current) : null;
}

const adminCannotSubscribe = () => new AppError(403, 'FORBIDDEN', 'La cuenta de administración no necesita premium');
const alreadyPremium = () => new AppError(409, 'CONFLICT', 'Ya eres premium; gestiona tu suscripción desde tu perfil');

// CU-21. Con stripe, el cliente se crea una vez por usuario y se guarda; con fake, la URL es /pago-simulado.
export async function startCheckout(user: User, now: Date = new Date()): Promise<string> {
  if (!canSubscribe(user)) throw adminCannotSubscribe();
  if (isPremium(user, now)) throw alreadyPremium();
  let customerId = user.stripeCustomerId;
  if (payments.name === 'stripe' && !customerId) {
    const created = await unavailable(() => payments.createCustomer({ userId: user.id, email: user.email }));
    customerId = await usersRepository.setStripeCustomerIdIfMissing(pool, user.id, created);
  }
  return unavailable(() => payments.createCheckout({ userId: user.id, customerId }));
}

// CU-27: cancelar y cambiar de tarjeta, en el portal de Stripe (o en /pago-simulado).
export async function openPortal(user: User): Promise<string> {
  if (payments.name === 'stripe' && !user.stripeCustomerId) {
    throw new AppError(409, 'CONFLICT', 'Todavía no tienes una suscripción que gestionar');
  }
  return unavailable(() => payments.createPortal(user.stripeCustomerId));
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Pago simulado, "Pagar": una suscripción fake activa de FAKE_PREMIUM_DAYS días, por applySubscription (RN-04).
export async function fakePay(user: User, ctx: RequestContext): Promise<User> {
  if (!canSubscribe(user)) throw adminCannotSubscribe();
  return withTransaction(async (client) => {
    const locked = await usersRepository.findByIdForUpdate(client, user.id);
    if (!locked) throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar');
    const now = Date.now();
    if (isPremium(locked, new Date(now))) throw alreadyPremium();
    const result = await applySubscription(
      client,
      {
        userId: user.id,
        provider: 'fake',
        snapshot: {
          providerSubscriptionId: `fake_${randomUUID()}`,
          customerId: null,
          status: 'active',
          currentPeriodEnd: new Date(now + FAKE_PREMIUM_DAYS * DAY_MS),
          cancelAtPeriodEnd: false,
        },
      },
      { kind: 'transitions', actorId: user.id, ip: ctx.ip, requestId: ctx.requestId },
    );
    return result.user;
  });
}

// Pago simulado, "Cancelar": al fin de periodo (CU-27); sigue premium hasta entonces.
export async function fakeCancel(user: User, ctx: RequestContext): Promise<SubscriptionDto> {
  return withTransaction(async (client) => {
    await usersRepository.findByIdForUpdate(client, user.id);
    const now = Date.now();
    const target = (await paymentsRepository.findByUser(client, user.id)).find(
      (sub) => sub.provider === 'fake' && sub.status === 'active' && !sub.cancelAtPeriodEnd && sub.currentPeriodEnd.getTime() > now,
    );
    if (!target) throw new AppError(409, 'CONFLICT', 'No tienes una suscripción activa que cancelar');
    const result = await applySubscription(
      client,
      {
        userId: user.id,
        provider: 'fake',
        snapshot: { ...target, customerId: null, cancelAtPeriodEnd: true },
      },
      { kind: 'transitions', actorId: user.id, ip: ctx.ip, requestId: ctx.requestId },
    );
    return toSubscriptionDto(result.subscription);
  });
}
