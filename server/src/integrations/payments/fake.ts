import type { PaymentsDriver } from './driver.js';

// Driver `fake` (pago simulado mínimo, solo en local: env.ts lo rechaza en producción). Checkout y portal llevan
// a /pago-simulado, donde "Pagar" y "Cancelar" llaman al servicio (POST /api/payments/fake/*), que aplica la
// suscripción con el mismo applySubscription que el webhook (RN-04). No hay proveedor remoto que consultar.

export const FAKE_CHECKOUT_PATH = '/pago-simulado';

export function createFakePayments(): PaymentsDriver {
  return {
    name: 'fake',
    async createCustomer() {
      throw new Error('El pago simulado no crea clientes de Stripe');
    },
    async createCheckout() {
      return FAKE_CHECKOUT_PATH;
    },
    async createPortal() {
      return FAKE_CHECKOUT_PATH;
    },
    async retrieveSubscription() {
      throw new Error('El pago simulado no tiene suscripciones remotas');
    },
  };
}
