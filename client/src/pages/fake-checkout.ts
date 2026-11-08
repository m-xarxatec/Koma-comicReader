import type { ApiError } from '../services/api.js';
import { getMe } from '../services/auth.js';
import { fakeCancel, fakePay, formatDate, getSubscription, type SubscriptionDto } from '../services/payments.js';

// /pago-simulado (solo PAYMENTS_DRIVER=fake; contrato del bloque 4, "Páginas"). "Pagar" sin premium o "Cancelar
// suscripción" con una simulada activa sin cancelar, y siempre "Volver a Premium" (respuesta 9 a los choques).

const status = document.querySelector<HTMLElement>('[data-status]');
const say = (message: string) => {
  if (status) status.textContent = message;
};
// Como en premium.ts y profile.ts: el mensaje con su código de referencia.
const sayError = (error: ApiError) => say(error.requestId ? `${error.message} (código de referencia: ${error.requestId})` : error.message);

type Step = 'pay' | 'cancel' | 'none';
function show(step: Step, text = ''): void {
  for (const group of document.querySelectorAll<HTMLElement>('[data-for]')) group.hidden = group.dataset['for'] !== step;
  const target = document.querySelector<HTMLElement>(step === 'cancel' ? '[data-period]' : '[data-none-text]');
  if (target && text) target.textContent = text;
}

// Booleano, no guarda de tipo: en la rama contraria la suscripción puede seguir existiendo (ya cancelada).
const cancelable = (sub: SubscriptionDto): boolean =>
  sub.provider === 'fake' && sub.status === 'active' && !sub.cancelAtPeriodEnd && Date.parse(sub.currentPeriodEnd) > Date.now();

async function render(): Promise<void> {
  const me = await getMe();
  if (!me.ok) {
    show('none');
    sayError(me.error);
    return;
  }
  const user = me.data.user;
  if (!user) {
    show('none', 'Tu sesión ha caducado: vuelve a entrar.');
    return;
  }
  if (user.role === 'admin') {
    show('none', 'La cuenta de administración no necesita premium.');
    return;
  }
  const result = await getSubscription();
  // Sin la suscripción no se sabe qué ofrecer: el error, y ningún botón.
  if (!result.ok) {
    show('none');
    sayError(result.error);
    return;
  }
  const subscription = result.data.subscription;
  if (subscription && cancelable(subscription)) {
    show('cancel', `Tu suscripción simulada está activa hasta el ${formatDate(subscription.currentPeriodEnd)}.`);
  } else if (user.isPremium && user.premiumUntil) {
    show(
      'none',
      subscription?.provider === 'fake' && subscription.cancelAtPeriodEnd
        ? `Ya cancelada: sigues siendo premium hasta el ${formatDate(user.premiumUntil)}.`
        : `Ya eres premium hasta el ${formatDate(user.premiumUntil)}; tu suscripción no es simulada.`,
    );
  } else {
    show('pay');
  }
}

const payButton = document.querySelector<HTMLButtonElement>('[data-pay]');
payButton?.addEventListener('click', async () => {
  payButton.disabled = true;
  say('');
  const result = await fakePay();
  if (result.ok) {
    location.assign('/premium/gracias');
    return;
  }
  sayError(result.error);
  payButton.disabled = false;
});

const cancelButton = document.querySelector<HTMLButtonElement>('[data-cancel]');
cancelButton?.addEventListener('click', async () => {
  cancelButton.disabled = true;
  say('');
  const result = await fakeCancel();
  if (result.ok) {
    show('none', `Suscripción cancelada: sigues siendo premium hasta el ${formatDate(result.data.subscription.currentPeriodEnd)}.`);
    say('Cancelación guardada.');
    // El botón con el foco se oculta: el foco pasa al resultado (tabindex="-1") y no cae a <body>.
    document.querySelector<HTMLElement>('[data-none-text]')?.focus();
    return;
  }
  sayError(result.error);
  cancelButton.disabled = false;
});

await render();
