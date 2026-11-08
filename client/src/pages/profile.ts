import { changePassword, updateProfile } from '../services/auth.js';
import { getSubscription, openPortal, periodText } from '../services/payments.js';
import {
  bindForm,
  confirmationOf,
  currentPasswordProblem,
  displayNameProblem,
  failureOutcome,
  initials,
  passwordProblem,
} from '../utils/validate.js';

// Página /perfil (CU-23). El servidor ya pintó los datos de la cuenta (escapados) y el plan (data-plan). Aquí
// se envían los dos formularios por api.ts y, al acertar, se actualiza con textContent lo que muestra el
// nombre: la cabecera de la página, el avatar y la cabecera del sitio.

const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });

// Fin del periodo Premium: el servidor deja la fecha en ISO (sin JS se lee así) y aquí se formatea en local.
const premiumUntil = document.querySelector<HTMLElement>('[data-premium-until]');
const until = premiumUntil?.dataset['premiumUntil'];
if (premiumUntil && until) premiumUntil.textContent = dateFormat.format(new Date(until));

// D18: con premium, "Se cancela el …" si la suscripción está cancelada al fin de periodo (CU-27), y "Gestionar
// suscripción" abre el portal de Stripe o el pago simulado.
const premiumCard = document.querySelector<HTMLElement>('.profile-card--premium');
if (premiumCard?.dataset['plan'] === 'premium' && until) {
  const subscription = await getSubscription();
  const period = premiumCard.querySelector<HTMLElement>('[data-premium-period]');
  if (period && subscription.ok) period.textContent = periodText(until, subscription.data.subscription);

  const manage = premiumCard.querySelector<HTMLButtonElement>('[data-manage-subscription]');
  const manageError = premiumCard.querySelector<HTMLElement>('[data-manage-error]');
  if (manage) {
    manage.disabled = false;
    manage.addEventListener('click', async () => {
      manage.disabled = true;
      if (manageError) manageError.hidden = true;
      const result = await openPortal();
      if (result.ok) {
        location.assign(result.data.url);
        return;
      }
      if (manageError) {
        manageError.textContent = result.error.requestId
          ? `${result.error.message} (código de referencia: ${result.error.requestId})`
          : result.error.message;
        manageError.hidden = false;
      }
      manage.disabled = false;
    });
  }
}

// Aviso de éxito del formulario (role="status", siempre en el árbol). Se borra al volver a escribir.
function statusOf(form: HTMLFormElement): (message: string) => void {
  const status = form.querySelector<HTMLElement>('[data-form-status]');
  form.addEventListener('input', () => {
    if (status) status.textContent = '';
  });
  return (message) => {
    if (status) status.textContent = message;
  };
}

const profileForm = document.querySelector<HTMLFormElement>('#profile-form');
const nameInput = document.querySelector<HTMLInputElement>('#profile-display-name');
if (profileForm && nameInput) {
  const setStatus = statusOf(profileForm);
  // El botón llega desactivado del HTML: sin JS no hay forma de enviar un PATCH.
  for (const button of profileForm.querySelectorAll<HTMLButtonElement>('button[data-needs-js]')) button.disabled = false;
  bindForm(profileForm, { displayName: displayNameProblem }, async (values) => {
    setStatus('');
    const result = await updateProfile(values['displayName'] ?? '');
    if (!result.ok) return failureOutcome(result.status, result.error);

    const { displayName } = result.data.user; // ya recortado por el servidor
    nameInput.value = displayName;
    for (const element of document.querySelectorAll<HTMLElement>('[data-display-name], [data-user-name]')) {
      element.textContent = displayName;
    }
    const avatar = document.querySelector<HTMLElement>('[data-initials]');
    if (avatar) avatar.textContent = initials(displayName);
    setStatus('Nombre guardado.');
    nameInput.focus(); // el botón se desactiva durante el envío y el foco no puede quedarse en él
    return { ok: true };
  });
}

const passwordForm = document.querySelector<HTMLFormElement>('#password-form');
if (passwordForm) {
  const setStatus = statusOf(passwordForm);
  // Mismo orden que el formulario (el foco del primer error lo decide bindForm).
  const rules = {
    currentPassword: currentPasswordProblem,
    newPassword: passwordProblem,
    newPasswordConfirm: confirmationOf('newPassword'),
  };
  bindForm(passwordForm, rules, async (values) => {
    setStatus('');
    // Solo los campos del contrato: la confirmación se queda en el cliente.
    const result = await changePassword(values['currentPassword'] ?? '', values['newPassword'] ?? '');
    if (!result.ok) return failureOutcome(result.status, result.error);

    // RN-15: la respuesta trae la cookie nueva; esta sesión sigue abierta y las demás se cierran.
    passwordForm.reset();
    setStatus('Contraseña cambiada. Se ha cerrado la sesión en los demás dispositivos.');
    passwordForm.querySelector<HTMLInputElement>('#password-current')?.focus();
    return { ok: true };
  });
}
