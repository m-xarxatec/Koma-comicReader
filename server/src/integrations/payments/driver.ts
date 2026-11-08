import type { SubscriptionSnapshot } from '../../modules/payments/payments.rules.js';

// Misma interfaz para los dos drivers (CLAUDE.md, "integrations/"): local y online solo cambian PAYMENTS_DRIVER.
// Contrato del bloque 4 (D10). Los métodos se llaman siempre a través del objeto `payments` (index.ts), para que
// los tests los sustituyan con mock.method sin red.

export interface CheckoutInput {
  userId: number;
  customerId: string | null; // cliente de Stripe ya guardado; null en fake
}

export interface PaymentsDriver {
  readonly name: 'fake' | 'stripe';
  // Cliente de Stripe nuevo (solo stripe). El servicio lo guarda en users.stripe_customer_id.
  createCustomer(input: { userId: number; email: string }): Promise<string>;
  // URL a la que navega el navegador para pagar (Checkout o /pago-simulado).
  createCheckout(input: CheckoutInput): Promise<string>;
  // URL del portal de cliente (cancelar y cambiar tarjeta, CU-27) o /pago-simulado.
  createPortal(customerId: string | null): Promise<string>;
  // Estado actual de la suscripción en el proveedor (syncSubscription, RN-04). Solo stripe.
  retrieveSubscription(id: string): Promise<SubscriptionSnapshot>;
}

// Stripe no responde o rechaza la llamada: el servicio responde 503 (SERVICE_UNAVAILABLE). Lleva solo el tipo y el
// código del error de Stripe, nunca la petición ni la respuesta.
export class PaymentsUnavailableError extends Error {
  constructor(detail: string) {
    super(`Proveedor de pagos: ${detail}`);
    this.name = 'PaymentsUnavailableError';
  }
}
