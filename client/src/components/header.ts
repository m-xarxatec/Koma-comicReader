import { getMe, logout } from '../services/auth.js';

// Cabecera con la sesión. El HTML (server/src/utils/layout.ts) trae siempre "Entrar" y "Registrarse", que
// funcionan sin JS. Con JS: si hay sesión, se cambian por el nombre (textContent) y un botón "Salir"; si
// no, los dos enlaces llevan en `next` la página actual (con el fragmento #v-n) para volver a ella después.

const AUTH_PATHS = ['/entrar', '/registro'];

const account = document.querySelector<HTMLElement>('[data-account]');

if (!AUTH_PATHS.includes(location.pathname)) {
  const here = `${location.pathname}${location.search}${location.hash}`;
  if (here !== '/') {
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-login-link]')) {
      link.search = new URLSearchParams({ next: here }).toString();
    }
  }
}

const result = await getMe();
const user = result.ok ? result.data.user : null;

if (user && account) {
  const name = document.createElement('span');
  name.className = 'site-header__user';
  name.textContent = user.displayName;

  const logoutButton = document.createElement('button');
  logoutButton.type = 'button';
  logoutButton.className = 'button button--outline site-header__logout';
  logoutButton.textContent = 'Salir';
  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    await logout();
    location.assign('/'); // la recarga muestra el estado real de la sesión
  });

  account.replaceChildren(name, logoutButton);
}
