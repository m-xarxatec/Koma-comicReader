import { fillTemplate } from './html.js';

// Cabecera, pie y navegación comunes, en un solo sitio. Las plantillas de client/public (pages/ y errors/)
// llevan los marcadores <!-- @head --> (dentro de <head>), <!-- @header --> y <!-- @footer -->, y todas las
// páginas (sendPage, plantillas de error y la página genérica del error-handler) pasan por renderTemplate.
// Son fragmentos fijos, sin datos de usuario: el nombre del usuario lo pinta components/header.ts con
// textContent. La página activa (aria-current) la marca el servidor, así funciona también sin JavaScript.

export const HEAD_MARKER = '<!-- @head -->';
export const HEADER_MARKER = '<!-- @header -->';
export const FOOTER_MARKER = '<!-- @footer -->';

// Excepción a "todo valor visual en variables.css": theme-color es un <meta> y el navegador no lee custom
// properties en él. Repite --color-bg de cada tema (tests/unit/layout.test.ts comprueba que coinciden).
// El oscuro va sin media: es el tema por defecto, como en variables.css.
export const THEME_COLORS = { light: '#f8f6fc', dark: '#0b0716' } as const;

const SITE_HEAD = `<meta name="theme-color" content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="${THEME_COLORS.dark}">`;

interface NavItem {
  href: string;
  label: string;
  icon: string;
  isCurrent: (path: string) => boolean;
}

// Solo rutas del plan que ya existen. Explorar lleva al catálogo de la portada (no hay /explorar).
const NAV: readonly NavItem[] = [
  { href: '/', label: 'Inicio', icon: 'home', isCurrent: (path) => path === '/' },
  { href: '/#catalogo', label: 'Explorar', icon: 'compass', isCurrent: () => false },
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
        <a class="button button--outline site-header__login" href="/entrar" data-login-link>Entrar</a>
        <a class="button button--primary site-header__signup" href="/registro" data-login-link>Registrarse</a>
      </div>
    </div>
  </header>
  <script type="module" src="/js/components/header.js"></script>`;
}

function siteFooter(path: string): string {
  return `<footer class="site-footer">
    <div class="site-footer__inner container">
      <p>© 2026 Koma · Hecho para quienes viven entre viñetas.</p>
      <p>Proyecto final de XarxaTec Activa.</p>
    </div>
  </footer>
  <nav class="mobile-nav" aria-label="Navegación móvil">
    ${navLinks(path, 'mobile-nav__link', '')}
  </nav>`;
}

// `path` es la ruta de la petición (req.path): marca con aria-current el enlace de la página actual.
export function applyLayout(template: string, path = ''): string {
  return template
    .replaceAll(HEAD_MARKER, SITE_HEAD)
    .replaceAll(HEADER_MARKER, siteHeader(path))
    .replaceAll(FOOTER_MARKER, siteFooter(path));
}

// Cabecera, pie y navegación, y después los valores ({{clave}}), siempre escapados.
export function renderTemplate(template: string, values: Readonly<Record<string, string>>, path = ''): string {
  return fillTemplate(applyLayout(template, path), values);
}
