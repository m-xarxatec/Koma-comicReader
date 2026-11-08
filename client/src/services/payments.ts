import { api } from './api.js';
import type { UserDto } from './auth.js';

// Premium (contrato del bloque 4, "Premium"; CU-21, CU-27). Todas las peticiones pasan por api.ts.

// Duplicado explícito del contrato (SubscriptionDto en server/src/modules/payments/payments.service.ts).
export interface SubscriptionDto {
  provider: 'stripe' | 'fake';
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  currentPeriodEnd: string; // ISO 8601
  cancelAtPeriodEnd: boolean; // CU-27: sigue premium hasta currentPeriodEnd
}

export const getSubscription = () => api.get<{ subscription: SubscriptionDto | null }>('/api/payments/subscription');
// Las dos devuelven la URL a la que navegar: Checkout o el portal de Stripe, o /pago-simulado con el driver fake.
export const startCheckout = () => api.post<{ url: string }>('/api/payments/checkout');
export const openPortal = () => api.post<{ url: string }>('/api/payments/portal');
// Pago simulado (solo PAYMENTS_DRIVER=fake).
export const fakePay = () => api.post<{ user: UserDto }>('/api/payments/fake/pay');
export const fakeCancel = () => api.post<{ subscription: SubscriptionDto }>('/api/payments/fake/cancel');

const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

// Texto del fin de periodo (CU-27): "activa hasta" o, si está cancelada, "se cancela el".
export function periodText(premiumUntil: string, subscription: SubscriptionDto | null): string {
  const canceled = subscription?.status === 'active' && subscription.cancelAtPeriodEnd;
  return canceled
    ? `Tu suscripción se cancela el ${formatDate(subscription.currentPeriodEnd)}: hasta entonces sigues siendo premium.`
    : `Tu suscripción Premium está activa hasta el ${formatDate(premiumUntil)}.`; // el mismo texto que pinta el servidor
}
