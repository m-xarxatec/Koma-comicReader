import type { ApiError } from '../services/api.js';
import { login, register } from '../services/auth.js';
import { safeNext } from '../utils/redirect.js';
import {
  bindForm,
  currentPasswordProblem,
  displayNameProblem,
  emailProblem,
  passwordConfirmProblem,
  passwordProblem,
  type SubmitOutcome,
} from '../utils/validate.js';

// Página auth (/entrar y /registro, CU-07 y CU-08). El servidor decide qué formulario se ve (data-mode);
// aquí se validan, se envían por api.ts y, al acertar, se vuelve a `next` (una ruta local segura, con el
// fragmento #v-n si lo traía) o a la portada.

const next = safeNext(new URLSearchParams(location.search).get('next'));

// Los enlaces entre /entrar y /registro conservan `next`.
for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-keep-next]')) {
  if (next !== '/') link.search = new URLSearchParams({ next }).toString();
}

const timeFormat = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

// Mensaje del servidor; con 429 se añade la hora a la que se puede volver a intentar y, si el fallo es
// del servidor o de la red, el código de referencia para buscarlo en los logs.
function failure(status: number, error: ApiError): SubmitOutcome {
  let message = error.message;
  if (error.code === 'RATE_LIMITED' && error.retryAt) {
    message += ` Podrás volver a intentarlo a las ${timeFormat.format(new Date(error.retryAt))}.`;
  }
  if ((status === 0 || status >= 500) && error.requestId) message += ` Código de referencia: ${error.requestId}.`;
  return { ok: false, message, ...(error.fields && { fields: error.fields }) };
}

const loginForm = document.querySelector<HTMLFormElement>('#login-form');
if (loginForm) {
  bindForm(loginForm, { email: emailProblem, password: currentPasswordProblem }, async (values) => {
    const result = await login({ email: values['email'] ?? '', password: values['password'] ?? '' });
    if (!result.ok) return failure(result.status, result.error);
    location.assign(next);
    return { ok: true };
  });
}

const registerForm = document.querySelector<HTMLFormElement>('#register-form');
if (registerForm) {
  // Mismo orden que el formulario (el foco lo decide showFieldErrors, que recorre los campos en orden).
  const rules = {
    displayName: displayNameProblem,
    email: emailProblem,
    password: passwordProblem,
    passwordConfirm: passwordConfirmProblem,
  };
  bindForm(registerForm, rules, async (values) => {
    // Solo los campos del contrato: passwordConfirm se queda en el cliente.
    const result = await register({
      email: values['email'] ?? '',
      password: values['password'] ?? '',
      displayName: values['displayName'] ?? '',
    });
    if (!result.ok) return failure(result.status, result.error);
    location.assign(next);
    return { ok: true };
  });
}
