import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';

// Valores de la maqueta que el CSS de Codex (314c14d) cambió sin decisión y que el agente frontend señaló en el cierre
// del bloque 6 (18-nov); el desarrollador aprobó volver a la maqueta. Se leen las hojas como texto, sin comentarios.

const styles = (...parts: string[]) =>
  readFileSync(path.join(paths.publicDir, 'styles', ...parts), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Cuerpo de la regla `selector` dentro de `@media (min-width: <width>)` (o de primer nivel, con width null).
function rule(css: string, width: string | null, selector: string): string | undefined {
  let scope = css;
  if (width !== null) {
    const media = css.indexOf(`@media (min-width: ${width})`);
    if (media === -1) return undefined;
    let depth = 0;
    let end = css.indexOf('{', media);
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}' && --depth === 0) break;
    }
    scope = css.slice(css.indexOf('{', media) + 1, end);
  }
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(scope)?.[1];
}

test('Seguridad: (CSS) en móvil, la ilustración del hero de la portada mide 175 px de alto, como la maqueta (hero.css, .hero__art)', () => {
  assert.match(styles('variables.css'), /--home-hero-min-height:\s*175px;/);
});

test('Seguridad: (CSS) el pago simulado va a dos columnas desde 40rem, como la maqueta (premium.css, .checkout-grid)', () => {
  const css = styles('components', 'fake-checkout.css');
  assert.match(rule(css, '40rem', '.checkout__grid') ?? '', /grid-template-columns:\s*var\(--checkout-grid-columns-medium\)/);
  assert.equal(rule(css, '64rem', '.checkout__grid'), undefined, 'sin repetirlo desde 64rem');
});

test('Seguridad: (CSS) el final del capítulo es texto centrado sin caja, como la maqueta (reader-layout.css, .reader-end)', () => {
  const html = readFileSync(path.join(paths.publicDir, 'pages', 'reader.html'), 'utf8');
  assert.match(html, /<section class="reader-screen reader-page__column" id="reader-end"/);
  assert.ok(!styles('components', 'reader-screen.css').includes('.reader-screen--end'), 'sin la tarjeta con borde');
  assert.ok(!/--reader-end-(padding|margin):/.test(styles('variables.css')), 'sin sus tokens');
});
