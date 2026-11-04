import { login, register } from '../services/auth.js';
import { safeNext } from '../utils/redirect.js';
import {
  bindForm,
  currentPasswordProblem,
  displayNameProblem,
  emailProblem,
  failureOutcome,
  passwordConfirmProblem,
  passwordProblem,
} from '../utils/validate.js';

// Página auth (/entrar y /registro, CU-07 y CU-08). El servidor decide qué formulario se ve (data-mode);
// aquí se validan, se envían por api.ts y, al acertar, se vuelve a `next` (una ruta local segura, con el
// fragmento #v-n si lo traía) o a la portada.

const next = safeNext(new URLSearchParams(location.search).get('next'));

// Los enlaces entre /entrar y /registro conservan `next`.
for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-keep-next]')) {
  if (next !== '/') link.search = new URLSearchParams({ next }).toString();
}

const loginForm = document.querySelector<HTMLFormElement>('#login-form');
if (loginForm) {
  bindForm(loginForm, { email: emailProblem, password: currentPasswordProblem }, async (values) => {
    const result = await login({ email: values['email'] ?? '', password: values['password'] ?? '' });
    if (!result.ok) return failureOutcome(result.status, result.error);
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
    if (!result.ok) return failureOutcome(result.status, result.error);
    location.assign(next);
    return { ok: true };
  });
}
