import { fillTemplate } from './html.js';

// Cabecera y pie comunes, en un solo sitio. Las plantillas de client/public (pages/ y errors/) llevan los
// marcadores <!-- @header --> y <!-- @footer -->, y todas las páginas (sendPage, plantillas de error y la
// página genérica del error-handler) pasan por renderTemplate. Son fragmentos fijos, sin datos de usuario:
// el nombre del usuario lo pinta components/header.ts con textContent.

export const HEADER_MARKER = '<!-- @header -->';
export const FOOTER_MARKER = '<!-- @footer -->';

const SITE_HEADER = `<a class="skip-link" href="#contenido">Saltar al contenido</a>
  <header class="site-header">
    <div class="site-header__inner">
      <a class="site-header__brand" href="/">Koma</a>
      <nav class="site-header__nav" aria-label="Principal">
        <ul class="site-header__list">
          <li><a class="site-header__link" href="/#catalogo">Catálogo</a></li>
          <li data-guest><a class="site-header__link" href="/entrar" data-login-link>Entrar</a></li>
        </ul>
      </nav>
    </div>
  </header>
  <script type="module" src="/js/components/header.js"></script>`;

const SITE_FOOTER = `<footer class="site-footer">
    <div class="site-footer__inner">
      <p>Koma — plataforma de cómics · Proyecto final de XarxaTec Activa</p>
    </div>
  </footer>`;

export function applyLayout(template: string): string {
  return template.replaceAll(HEADER_MARKER, SITE_HEADER).replaceAll(FOOTER_MARKER, SITE_FOOTER);
}

// Cabecera y pie, y después los valores ({{clave}}), siempre escapados.
export function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return fillTemplate(applyLayout(template), values);
}
