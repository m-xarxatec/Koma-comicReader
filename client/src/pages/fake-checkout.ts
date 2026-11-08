import { getMe } from '../services/auth.js';
import { fakeCancel, fakePay, formatDate, getSubscription, type SubscriptionDto } from '../services/payments.js';

// /pago-simulado (solo PAYMENTS_DRIVER=fake; contrato del bloque 4, "Páginas"). "Pagar" sin premium o "Cancelar
// suscripción" con una simulada activa sin cancelar, y siempre "Volver a Premium" (respuesta 9 a los choques).

const status = document.querySelector<HTMLElement>('[data-status]');
const say = (message: string) => {
  if (status) status.textContent = message;
};

type Step = 'pay' | 'cancel' | 'none';
function show(step: Step, text = ''): void {
  for (const group of document.querySelectorAll<HTMLElement>('[data-for]')) group.hidden = group.dataset['for'] !== step;
  const target = document.querySelector<HTMLElement>(step === 'cancel' ? '[data-period]' : '[data-none-text]');
  if (target && text) target.textContent = text;
}

const cancelable = (sub: SubscriptionDto | null): sub is SubscriptionDto =>
  sub !== null && sub.provider === 'fake' && sub.status === 'active' && !sub.cancelAtPeriodEnd && Date.parse(sub.currentPeriodEnd) > Date.now();

async function render(): Promise<void> {
  const me = await getMe();
  const user = me.ok ? me.data.user : null;
  if (!user) {
    show('none', 'Tu sesión ha caducado: vuelve a entrar.');
    return;
  }
  if (user.role === 'admin') {
    show('none', 'La cuenta de administración no necesita premium.');
    return;
  }
  const result = await getSubscription();
  const subscription = result.ok ? result.data.subscription : null;
  if (cancelable(subscription)) {
    show('cancel', `Tu suscripción simulada está activa hasta el ${formatDate(subscription.currentPeriodEnd)}.`);
  } else if (user.isPremium && user.premiumUntil) {
    show('none', `Ya cancelada: sigues siendo premium hasta el ${formatDate(user.premiumUntil)}.`);
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
  say(result.error.message);
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
    return;
  }
  say(result.error.message);
  cancelButton.disabled = false;
});

await render();
