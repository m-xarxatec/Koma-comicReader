import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as limits from '../../config/limits.js';
import { paths } from '../../config/paths.js';

// E2 del pulido en /admin (docs/plan_mvp.md, «Pulido»; 20-nov), hecho por la IA de este repositorio: el diálogo en su
// propio CSS, Confirmar en contorno de peligro, el contador del motivo y «Admin» activo no solo por el color. Más las
// correcciones de la revisión de dac64b3 (Codex): el resumen de filtros solo con una respuesta correcta y cada regla
// en el archivo de su bloque.

interface ClientAdmin {
  REJECTION_REASON_MAX: number;
  reasonCount: (value: string) => { text: string; over: boolean };
  confirmButtonClass: (danger: boolean) => string;
  filtersSummary: (labels: readonly string[]) => string;
}
interface ClientValidate {
  textLength: (value: string, multiline?: boolean) => number;
}

const load = <T>(file: string) => import(pathToFileURL(path.join(paths.clientDistDir, file)).href) as Promise<T>;
const admin = await load<ClientAdmin>('utils/admin.js');
const validate = await load<ClientValidate>('utils/validate.js');

const read = (...parts: string[]) => readFileSync(path.join(paths.publicDir, ...parts), 'utf8');
const css = (file: string) => read('styles', 'components', file).replace(/\/\*[\s\S]*?\*\//g, '');
const html = read('pages', 'admin.html');
const adminTs = readFileSync(path.join(paths.root, 'client', 'src', 'pages', 'admin.ts'), 'utf8');

// Cuerpo de la regla cuyo selector contiene `selector` (la primera), sin @media.
function ruleBody(source: string, selector: string): string {
  const at = source.indexOf(selector);
  assert.notEqual(at, -1, `no está ${selector}`);
  const open = source.indexOf('{', at);
  return source.slice(open + 1, source.indexOf('}', open));
}

// Texto de una función de admin.ts hasta su cierre en columna 0.
const fn = (name: string) => {
  const start = adminTs.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  return adminTs.slice(start, adminTs.indexOf('\n}\n', start));
};

// Lo que queda fuera de @media print (la vista de impresión sí puede anular otros bloques, D10).
const screenOnly = (source: string) => source.slice(0, source.indexOf('@media print'));

test('RN-05: el contador del motivo cuenta como el servidor (puntos de código, saltos normalizados) y avisa al pasar de 500', () => {
  assert.equal(admin.REJECTION_REASON_MAX, limits.REJECTION_REASON_MAX);
  assert.deepEqual(admin.reasonCount(''), { text: `0 / ${limits.REJECTION_REASON_MAX}`, over: false });
  assert.deepEqual(admin.reasonCount('😀 ok'), { text: `4 / ${limits.REJECTION_REASON_MAX}`, over: false });
  assert.equal(admin.reasonCount('a\r\nb').text, `${validate.textLength('a\r\nb', true)} / ${limits.REJECTION_REASON_MAX}`);
  assert.equal(admin.reasonCount('x'.repeat(limits.REJECTION_REASON_MAX)).over, false);
  assert.deepEqual(admin.reasonCount('x'.repeat(limits.REJECTION_REASON_MAX + 1)), {
    text: `${limits.REJECTION_REASON_MAX + 1} / ${limits.REJECTION_REASON_MAX}`,
    over: true,
  });
});

test('RN-05: el contador del motivo está en el diálogo, unido al campo, sin anunciarse a cada tecla', () => {
  assert.ok(
    html.includes('<output class="admin-dialog__count" id="admin-reason-count" for="admin-reason" aria-live="off">0 / 500</output>'),
    'contador',
  );
  assert.ok(html.includes('aria-describedby="admin-reason-hint admin-reason-count admin-reason-error"'), 'descrito por el contador');
  assert.ok(adminTs.includes('reasonCount(reasonInput.value)'), 'admin.ts cuenta con la función común');
  assert.equal(fn('confirmAction').split('updateReasonCount()').length - 1, 2, 'al abrir el diálogo y a cada cambio del motivo');
});

test('Seguridad: (E2) Confirmar, en una acción peligrosa, va con contorno de peligro como en el estudio', () => {
  assert.equal(admin.confirmButtonClass(true), 'button button--outline button--danger');
  assert.equal(admin.confirmButtonClass(false), 'button button--primary');
  assert.ok(fn('confirmAction').includes('confirmButtonClass(options.danger'), 'admin.ts usa la función');
});

test('Seguridad: (E2) el diálogo de /admin tiene su propio CSS, enlazado en la página, y admin-page.css ya no lo lleva', () => {
  assert.ok(html.includes('<link rel="stylesheet" href="/styles/components/admin-dialog.css">'), 'enlazado');
  const dialogCss = css('admin-dialog.css');
  for (const selector of ['.admin-dialog {', '.admin-dialog::backdrop', '.admin-dialog__title', '.admin-dialog__text', '.admin-dialog__actions', '.admin-dialog__count', '.admin-dialog__count--over']) {
    assert.ok(dialogCss.includes(selector), selector);
  }
  assert.ok(ruleBody(dialogCss, '.admin-dialog__count--over').includes('var(--color-danger)'), 'pasado de largo, en color de peligro');
  assert.ok(!css('admin-page.css').includes('admin-dialog'), 'nada del diálogo en admin-page.css');
});

test('Seguridad: (E2) «Admin» y «Premium» activos en la cabecera se distinguen también por una marca, no solo por el color', () => {
  const body = ruleBody(css('site-header.css'), '.site-header__admin[aria-current="page"]');
  assert.match(body, /box-shadow:\s*inset 0 calc\(-1 \* var\(--nav-indicator-height\)\) 0 var\(--color-accent\)/);
});

test('Seguridad: (filtros) el resumen de filtros aplicados se escribe solo con una respuesta correcta, no al enviar', () => {
  assert.equal(admin.filtersSummary([]), 'Sin filtros');
  assert.equal(admin.filtersSummary(['Estado: Pendientes', 'Buscar: ana']), 'Estado: Pendientes · Buscar: ana');
  assert.ok(fn('bindFilters').includes('view.pendingApplied = filtersSummary('), 'el envío deja el resumen pendiente');
  assert.ok(!/applied\.textContent|summary/.test(fn('bindFilters')), 'el envío no escribe el resumen');
  assert.ok(fn('showRows').includes('view.applied'), 'lo escribe la respuesta correcta');
  // state.filters ya guarda los filtros nuevos: un error (400, 429, 5xx, red) deja el resumen pendiente para la
  // siguiente respuesta correcta, que ya se filtra con ellos.
  assert.ok(!fn('showError').includes('pendingApplied'), 'un error no descarta el resumen pendiente');
});

test('Seguridad: (CSS) cada regla del admin en el archivo de su bloque, con sus tokens, y sin repetir las de button.css y breadcrumb.css', () => {
  const page = css('admin-page.css');
  const stats = screenOnly(css('admin-stats.css'));
  assert.ok(!stats.includes('.admin-page__'), 'admin-stats.css solo con .admin-stats (salvo la impresión)');
  assert.ok(page.includes('.admin-page__priority {'), 'la tarjeta de la cola, en admin-page.css');
  assert.ok(page.includes('.admin-page__queue-link {'), 'su enlace, en admin-page.css');
  for (const [file, source] of [['admin-page.css', page], ['admin-stats.css', stats]] as const) {
    assert.ok(!source.includes('var(--focus-ring) solid'), `${file}: el grosor del anillo de foco no es un borde`);
    assert.ok(!source.includes('--gradient-admin-notes'), `${file}: el degradado de las notas es de las notas`);
  }
  assert.ok(!page.includes('.button:hover'), 'la regla de movimiento reducido de los botones vive en button.css');
  assert.ok(!page.includes('.breadcrumb__link'), 'el área táctil de las migas vive en breadcrumb.css');
});
