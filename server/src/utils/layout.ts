import { escapeHtml, fillTemplate } from './html.js';

// Cabecera, pie y navegación comunes, en un solo sitio. Las plantillas de client/public (pages/ y errors/)
// llevan los marcadores <!-- @head --> (dentro de <head>), <!-- @header --> y <!-- @footer --> (y home.html,
// además, <!-- @community -->), y todas las páginas (sendPage, plantillas de error y la página genérica del
// error-handler) pasan por renderTemplate.
// Son fragmentos fijos, sin datos de usuario: el nombre del usuario lo pinta components/header.ts con
// textContent. La página activa (aria-current) la marca el servidor, así funciona también sin JavaScript.

export const HEAD_MARKER = '<!-- @head -->';
export const HEADER_MARKER = '<!-- @header -->';
export const FOOTER_MARKER = '<!-- @footer -->';
// Solo en home.html: el acceso rápido «Comunidad» (enlace de Discord, contrato del bloque 5, D13).
export const COMMUNITY_MARKER = '<!-- @community -->';

// Excepción a "todo valor visual en variables.css": theme-color es un <meta> y el navegador no lee custom
// properties en él. Repite --color-bg (tests/unit/layout.test.ts comprueba que coinciden). Un solo valor:
// la plataforma solo tiene tema oscuro.
export const THEME_COLOR = '#0b0716';

const SITE_HEAD = `<meta name="theme-color" content="${THEME_COLOR}">`;

interface NavItem {
  href: string;
  label: string;
  icon: string;
  isCurrent: (path: string) => boolean;
}

// Solo rutas del plan que ya existen. Explorar lleva al catálogo de la portada (no hay /explorar). "Crear" sale para
// todos y lo resuelve el servidor en /crear: el autor va a /autor, quien no lo es ve "¿Aún no eres creador?" y el
// invitado pasa antes por el login. Funciona sin JS.
const NAV: readonly NavItem[] = [
  { href: '/', label: 'Inicio', icon: 'home', isCurrent: (path) => path === '/' },
  { href: '/#catalogo', label: 'Explorar', icon: 'compass', isCurrent: () => false },
  { href: '/crear', label: 'Crear', icon: 'pencil', isCurrent: (path) => path === '/crear' || path === '/autor' },
];

const icon = (name: string, className = 'icon') =>
  `<svg class="${className}" aria-hidden="true"><use href="/icons/sprite.svg#icon-${name}"/></svg>`;

function navLinks(path: string, linkClass: string, activeClass: string): string {
  return NAV.map((item) => {
    const current = item.isCurrent(path);
    const classes = current && activeClass ? `${linkClass} ${activeClass}` : linkClass;
    const classAttr = classes ? ` class="${classes}"` : '';
    return `<a${classAttr} href="${item.href}"${current ? ' aria-current="page"' : ''}>${icon(item.icon)}<span>${item.label}</span></a>`;
  }).join('\n        ');
}

function siteHeader(path: string): string {
  return `<a class="skip-link" href="#contenido">Saltar al contenido</a>
  <header class="site-header">
    <div class="site-header__inner container">
      <a class="site-header__brand" href="/">
        <img class="site-header__logo" src="/icons/koma-logo.webp" alt="Koma, ir al inicio" width="155" height="53">
      </a>
      <nav class="site-nav" aria-label="Navegación principal">
        ${navLinks(path, 'site-nav__link', 'site-nav__link--active')}
      </nav>
      <form class="site-search" role="search" action="/" method="get">
        <label class="visually-hidden" for="buscar-comics">Buscar cómics, autores o géneros</label>
        ${icon('search', 'icon site-search__icon')}
        <input class="site-search__input" id="buscar-comics" name="q" type="search" placeholder="Buscar cómics, autores, géneros..." autocomplete="off">
        <button class="site-search__submit" type="submit" aria-label="Buscar">${icon('arrow')}</button>
      </form>
      <div class="site-header__account" data-account>
        <a class="site-header__premium" href="/premium" aria-label="Premium" data-premium-link${path === '/premium' ? ' aria-current="page"' : ''}>${icon('crown')}<span class="site-header__premium-label">Premium</span></a>
        <a class="button button--outline site-header__login" href="/entrar" data-login-link>Entrar</a>
        <a class="button button--primary site-header__signup" href="/registro" data-login-link>Registrarse</a>
      </div>
    </div>
  </header>
  <script type="module" src="/js/components/header.js"></script>`;
}

// Enlace de Discord (idea 10; D12 y D13): la URL llega validada por env.ts (https, discord.gg o discord.com) y se
// escapa aquí. layout.ts no importa env (los tests unitarios no cargan .env): se la pasan page.ts y error-handler.ts.
const NEW_TAB = ' target="_blank" rel="noopener noreferrer"';
const NEW_TAB_NOTE = '<span class="visually-hidden"> (se abre en otra pestaña)</span>';

function siteFooter(path: string, discordUrl: string | null): string {
  const discord = discordUrl
    ? `\n      <p><a class="site-footer__link" href="${escapeHtml(discordUrl)}"${NEW_TAB}>Únete a nuestro Discord${NEW_TAB_NOTE}</a></p>`
    : '';
  return `<footer class="site-footer">
    <div class="site-footer__inner container">
      <p>© 2026 Koma · Hecho para quienes viven entre viñetas.</p>${discord}
      <p>Proyecto final de XarxaTec Activa.</p>
    </div>
  </footer>
  <nav class="mobile-nav" aria-label="Navegación móvil">
    ${navLinks(path, 'mobile-nav__link', '')}
  </nav>`;
}

// «Comunidad» de la portada: con URL, enlace a la invitación en otra pestaña; sin ella, «Próximamente» (D13).
function communityLink(discordUrl: string | null): string {
  const copy = '<span class="quick-link__copy"><strong>Comunidad</strong><small>Comenta y comparte</small>';
  if (!discordUrl) {
    return `<span class="quick-link quick-link--soon">${icon('users', 'icon quick-link__icon')}${copy}<small class="quick-link__soon">Próximamente</small></span></span>`;
  }
  return `<a class="quick-link" href="${escapeHtml(discordUrl)}"${NEW_TAB}>${icon('users', 'icon quick-link__icon')}${copy}${NEW_TAB_NOTE}</span>${icon('arrow', 'icon quick-link__arrow')}</a>`;
}

// `path` es la ruta de la petición (req.path): marca con aria-current el enlace de la página actual.
// `discordUrl`: DISCORD_INVITE_URL ya validada, o null sin ella.
export function applyLayout(template: string, path = '', discordUrl: string | null = null): string {
  return template
    .replaceAll(HEAD_MARKER, SITE_HEAD)
    .replaceAll(HEADER_MARKER, siteHeader(path))
    .replaceAll(FOOTER_MARKER, siteFooter(path, discordUrl))
    .replaceAll(COMMUNITY_MARKER, communityLink(discordUrl));
}

// Cabecera, pie y navegación, y después los valores ({{clave}}), siempre escapados.
export function renderTemplate(template: string, values: Readonly<Record<string, string>>, path = '', discordUrl: string | null = null): string {
  return fillTemplate(applyLayout(template, path, discordUrl), values);
}
