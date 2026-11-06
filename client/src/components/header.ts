import { getMe, logout } from '../services/auth.js';

// Cabecera con la sesión. El HTML (server/src/utils/layout.ts) trae siempre "Entrar" y "Registrarse", que
// funcionan sin JS. Con JS: si hay sesión, se cambian por el nombre (textContent, enlazado a /perfil) y un
// botón "Salir"; si no, los dos enlaces llevan en `next` la página actual (con el fragmento #v-n) para volver
// a ella después.

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

  account.replaceChildren(name, logoutButton);
}

// D16: "Crear" (el estudio del autor, /autor) solo para quien es autor; un admin nunca lo es. Va al final de la
// navegación de la cabecera y de la móvil, con el mismo marcado que los enlaces de layout.ts. La página /autor la
// protege el servidor: esto solo decide si se enseña el enlace.
if (user?.isAuthor) {
  const here = location.pathname === '/autor';
  const createLink = (linkClass: string, activeClass: string) => {
    const link = document.createElement('a');
    link.className = here && activeClass ? `${linkClass} ${activeClass}` : linkClass;
    link.href = '/autor';
    if (here) link.setAttribute('aria-current', 'page');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '/icons/sprite.svg#icon-pencil');
    svg.append(use);
    const label = document.createElement('span');
    label.textContent = 'Crear';
    link.append(svg, label);
    return link;
  };
  document.querySelector('.site-nav')?.append(createLink('site-nav__link', 'site-nav__link--active'));
  document.querySelector('.mobile-nav')?.append(createLink('mobile-nav__link', ''));
}
