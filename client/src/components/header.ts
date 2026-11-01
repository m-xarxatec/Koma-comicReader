import { getMe, logout } from '../services/auth.js';

// Cabecera con la sesión. El HTML (server/src/utils/layout.ts) trae siempre "Entrar", que funciona sin JS.
// Con JS: si hay sesión, se cambia por el nombre (textContent) y un botón "Salir"; si no, "Entrar" lleva
// en `next` la página actual (con el fragmento #v-n) para volver a ella tras iniciar sesión.

const AUTH_PATHS = ['/entrar', '/registro'];

const guestItem = document.querySelector<HTMLLIElement>('[data-guest]');
const loginLink = document.querySelector<HTMLAnchorElement>('[data-login-link]');

if (loginLink && !AUTH_PATHS.includes(location.pathname)) {
  const here = `${location.pathname}${location.search}${location.hash}`;
  if (here !== '/') loginLink.search = new URLSearchParams({ next: here }).toString();
}

const result = await getMe();
const user = result.ok ? result.data.user : null;

if (user && guestItem) {
  const nameItem = document.createElement('li');
  nameItem.className = 'site-header__user';
  nameItem.textContent = user.displayName;

  const logoutButton = document.createElement('button');
  logoutButton.type = 'button';
  logoutButton.className = 'site-header__link site-header__button';
  logoutButton.textContent = 'Salir';
  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    await logout();
    location.assign('/'); // la recarga muestra el estado real de la sesión
  });

  const logoutItem = document.createElement('li');
  logoutItem.append(logoutButton);
  guestItem.replaceWith(nameItem, logoutItem);
}
