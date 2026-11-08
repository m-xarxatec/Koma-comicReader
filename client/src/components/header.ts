import { getMe, logout } from '../services/auth.js';

// Cabecera con la sesión. El HTML (server/src/utils/layout.ts) trae siempre "Entrar" y "Registrarse", que
// funcionan sin JS. Con JS: si hay sesión, se cambian por el nombre (textContent, enlazado a /perfil) y un
// botón "Salir"; si no, los dos enlaces llevan en `next` la página actual (con el fragmento #v-n) para volver
// a ella después. "Crear" ya no se añade aquí: layout.ts lo pinta para todos y el servidor lo resuelve en /crear.

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

// D19: "Premium" (layout.ts lo pinta dentro de la cuenta) para todos menos el admin, que no se hace premium.
const premiumLink = account?.querySelector<HTMLAnchorElement>('[data-premium-link]') ?? null;
if (user?.role === 'admin') premiumLink?.remove();

if (user && account) {
  // D16: el nombre lleva a /perfil. data-user-name: profile.ts lo actualiza al cambiar el nombre.
  const name = document.createElement('a');
  name.className = 'site-header__user';
  name.href = '/perfil';
  name.dataset['userName'] = '';
  name.textContent = user.displayName;
  if (location.pathname === '/perfil') name.setAttribute('aria-current', 'page');

  const logoutButton = document.createElement('button');
  logoutButton.type = 'button';
  logoutButton.className = 'button button--outline site-header__logout';
  logoutButton.textContent = 'Salir';
  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    await logout();
    location.assign('/'); // la recarga muestra el estado real de la sesión
  });

  account.replaceChildren(...(premiumLink && user.role !== 'admin' ? [premiumLink] : []), name, logoutButton);
}
