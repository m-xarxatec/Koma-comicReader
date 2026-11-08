import type { ApiError } from '../services/api.js';
import { getMe, type UserDto } from '../services/auth.js';
import { getSubscription, openPortal, periodText, startCheckout } from '../services/payments.js';

// /premium y /premium/gracias (contrato del bloque 4, "Páginas"; CU-21). El servidor elige la vista (data-view en
// <body>). Oferta: los botones según quién mira (D11: el checkout va por api.ts y se navega a la URL que devuelve).
// Gracias: se consulta /api/me hasta ver premium (el webhook puede tardar unos segundos) y se muestra la bienvenida.

// Constantes de la espera (contrato: cada 2 s, como mucho 30 s).
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30_000;

const view = document.body.dataset['view'];
const errorBox = document.querySelector<HTMLElement>('[data-plan-error]');

function showError(error: ApiError): void {
  if (!errorBox) return;
  errorBox.textContent = error.requestId ? `${error.message} (código de referencia: ${error.requestId})` : error.message;
}

// Navega a Checkout, al portal o a /pago-simulado; el botón queda desactivado mientras tanto.
async function go(button: HTMLButtonElement, request: typeof startCheckout): Promise<void> {
  button.disabled = true;
  if (errorBox) errorBox.textContent = '';
  const result = await request();
  if (result.ok) {
    location.assign(result.data.url);
    return;
  }
  showError(result.error);
  button.disabled = false;
}

type Audience = 'guest' | 'user' | 'premium' | 'admin';
const audienceOf = (user: UserDto | null): Audience =>
  user === null ? 'guest' : user.role === 'admin' ? 'admin' : user.isPremium ? 'premium' : 'user';

async function setUpOffer(user: UserDto | null): Promise<void> {
  const audience = audienceOf(user);
  for (const group of document.querySelectorAll<HTMLElement>('[data-plan-card] [data-for]')) {
    group.hidden = group.dataset['for'] !== audience;
  }

  const form = document.querySelector<HTMLFormElement>('[data-for="user"]');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) void go(button, startCheckout);
  });

  if (audience === 'premium' && user?.premiumUntil) {
    const until = document.querySelector<HTMLElement>('[data-premium-until]');
    const subscription = await getSubscription();
    if (until) until.textContent = periodText(user.premiumUntil, subscription.ok ? subscription.data.subscription : null);
    const manage = document.querySelector<HTMLButtonElement>('[data-manage]');
    manage?.addEventListener('click', () => void go(manage, openPortal));
  }
}

const status = document.querySelector<HTMLElement>('[data-premium-status]');
const setStep = (step: 'waiting' | 'welcome' | 'late') => {
  for (const element of document.querySelectorAll<HTMLElement>('[data-step]')) element.hidden = element.dataset['step'] !== step;
};

async function waitForPremium(): Promise<void> {
  const started = Date.now();
  for (;;) {
    const me = await getMe();
    if (me.ok && me.data.user?.isPremium) {
      setStep('welcome');
      if (status) status.textContent = 'Pago confirmado: ya eres premium. Desde ahora lees sin límites y sin anuncios.';
      return;
    }
    if (Date.now() - started >= POLL_TIMEOUT_MS) {
      setStep('late');
      if (status) {
        status.textContent =
          'El pago tarda más de lo normal. Si lo has completado, tu Premium aparecerá en tu perfil en unos minutos.';
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

if (view === 'thanks') {
  void waitForPremium();
} else {
  const me = await getMe();
  await setUpOffer(me.ok ? me.data.user : null);
}
