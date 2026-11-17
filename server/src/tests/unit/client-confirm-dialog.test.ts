import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';

// D2 del pulido (docs/plan_mvp.md, «Pulido»): el estudio del autor confirma en un <dialog> y avisa en un aviso
// flotante, como /admin, en lugar de confirm() y de los mensajes por sección. Se carga el JS compilado del
// componente (client/dist, lo genera `tsc -b`) con elementos simulados: sin DOM, solo EventTarget de Node.

class FakeClassList {
  private readonly names = new Set<string>();
  toggle(name: string, force?: boolean): boolean {
    const on = force ?? !this.names.has(name);
    if (on) this.names.add(name);
    else this.names.delete(name);
    return on;
  }
  contains(name: string): boolean {
    return this.names.has(name);
  }
}

class FakeElement extends EventTarget {
  textContent = '';
  className = '';
  classList = new FakeClassList();
  focusCount = 0;
  focus(): void {
    this.focusCount += 1;
  }
}

// Como el <dialog> del navegador: showModal() con el diálogo abierto lanza; close(valor) fija returnValue (sin
// valor, como Escape, lo deja igual) y emite «close» solo si estaba abierto.
class FakeDialog extends FakeElement {
  open = false;
  returnValue = '';
  closeCalls = 0;
  showModal(): void {
    if (this.open) throw new Error('InvalidStateError');
    this.open = true;
  }
  close(value?: string): void {
    this.closeCalls += 1;
    if (!this.open) return;
    this.open = false;
    if (value !== undefined) this.returnValue = value;
    this.dispatchEvent(new Event('close'));
  }
}

interface Parts {
  dialog: FakeDialog;
  title: FakeElement;
  text: FakeElement;
  confirmButton: FakeElement;
  cancelButton: FakeElement;
}
interface Options {
  title: string;
  text: string;
  confirm: string;
  danger?: boolean;
}
interface ConfirmDialogModule {
  NOTICE_ERROR_CLASS: string;
  confirmDialogParts: (root: { querySelector: (selector: string) => FakeElement | null }) => Parts | null;
  confirmAction: (parts: Parts | null, options: Options) => Promise<boolean>;
  announce: (region: FakeElement | null, message: string, error?: boolean, schedule?: (callback: () => void) => unknown) => void;
}

const load = () => import(pathToFileURL(path.join(paths.clientDistDir, 'components', 'confirm-dialog.js')).href) as Promise<ConfirmDialogModule>;

const parts = (): Parts => ({
  dialog: new FakeDialog(),
  title: new FakeElement(),
  text: new FakeElement(),
  confirmButton: new FakeElement(),
  cancelButton: new FakeElement(),
});

const WITHDRAW = { title: '¿Retirar la obra?', text: 'Dejará de estar visible.', confirm: 'Retirar', danger: true };

test('Seguridad: (D2) el diálogo de confirmación solo confirma con «Confirmar»: Cancelar y Escape resuelven false', async () => {
  const { confirmAction } = await load();

  const confirmed = parts();
  const yes = confirmAction(confirmed, WITHDRAW);
  assert.equal(confirmed.dialog.open, true, 'se abre como modal');
  assert.equal(confirmed.title.textContent, WITHDRAW.title);
  assert.equal(confirmed.text.textContent, WITHDRAW.text);
  assert.equal(confirmed.confirmButton.textContent, WITHDRAW.confirm);
  assert.equal(confirmed.cancelButton.focusCount, 1, 'el foco empieza en Cancelar');
  confirmed.dialog.close('confirm'); // el botón de envío de method="dialog" lleva value="confirm"
  assert.equal(await yes, true);

  const cancelled = parts();
  const no = confirmAction(cancelled, WITHDRAW);
  cancelled.cancelButton.dispatchEvent(new Event('click'));
  assert.equal(cancelled.dialog.open, false, 'Cancelar cierra el diálogo');
  assert.equal(await no, false);

  const escaped = parts();
  const escape = confirmAction(escaped, WITHDRAW);
  escaped.dialog.close(); // Escape cierra sin valor
  assert.equal(await escape, false);
});

test('Seguridad: (D2) con el diálogo ya abierto, otra confirmación resuelve false sin tocarlo, y los listeners de una apertura no sobreviven a su cierre', async () => {
  const { confirmAction } = await load();
  const shared = parts();

  const first = confirmAction(shared, WITHDRAW);
  assert.equal(await confirmAction(shared, { title: 'Otra', text: 'Otra acción', confirm: 'Sí' }), false);
  assert.equal(shared.title.textContent, WITHDRAW.title, 'la segunda no cambia el diálogo abierto');
  shared.dialog.close('confirm');
  assert.equal(await first, true);

  // Con el diálogo cerrado, un clic en Cancelar no debe llegar a ningún listener de la apertura anterior.
  const closeCalls = shared.dialog.closeCalls;
  shared.cancelButton.dispatchEvent(new Event('click'));
  assert.equal(shared.dialog.closeCalls, closeCalls, 'sin listeners sueltos');

  // Una nueva apertura sobre el mismo diálogo empieza sin la confirmación anterior.
  const second = confirmAction(shared, WITHDRAW);
  assert.equal(shared.dialog.returnValue, '', 'returnValue se limpia al abrir');
  shared.dialog.close();
  assert.equal(await second, false);
});

test('Seguridad: (D2) una acción peligrosa pinta Confirmar como los «Retirar» del estudio (contorno de peligro); sin las piezas del diálogo no se confirma nada', async () => {
  const { confirmAction } = await load();

  const danger = parts();
  void confirmAction(danger, WITHDRAW);
  assert.equal(danger.confirmButton.className, 'button button--outline button--danger');
  danger.dialog.close();

  const normal = parts();
  void confirmAction(normal, { ...WITHDRAW, danger: false });
  assert.equal(normal.confirmButton.className, 'button button--primary');
  normal.dialog.close();

  assert.equal(await confirmAction(null, WITHDRAW), false);
});

test('Seguridad: (D2) confirmDialogParts encuentra las cinco piezas del diálogo y devuelve null si falta una', async () => {
  const { confirmDialogParts } = await load();
  const selectors = ['#confirm-dialog', '#confirm-dialog-title', '#confirm-dialog-text', '[data-confirm-dialog-confirm]', '[data-confirm-dialog-cancel]'];
  const found = new Map(selectors.map((selector) => [selector, new FakeElement()]));
  const root = (missing?: string) => ({ querySelector: (selector: string) => (selector === missing ? null : (found.get(selector) ?? null)) });

  const all = confirmDialogParts(root());
  assert.ok(all, 'con todas las piezas');
  assert.equal(all.dialog, found.get('#confirm-dialog'));
  assert.equal(all.confirmButton, found.get('[data-confirm-dialog-confirm]'));
  assert.equal(all.cancelButton, found.get('[data-confirm-dialog-cancel]'));
  for (const missing of selectors) assert.equal(confirmDialogParts(root(missing)), null, missing);
});

test('Seguridad: (D2) el aviso flotante se vacía antes de escribir (un aviso igual al anterior también se anuncia) y marca o desmarca el error', async () => {
  const { announce, NOTICE_ERROR_CLASS } = await load();
  const region = new FakeElement();
  const queue: (() => void)[] = [];
  const schedule = (callback: () => void) => queue.push(callback);
  const flush = () => queue.splice(0).forEach((callback) => callback());

  announce(region, 'Portada actualizada.', false, schedule);
  assert.equal(region.textContent, '', 'primero se vacía');
  flush();
  assert.equal(region.textContent, 'Portada actualizada.');
  assert.equal(region.classList.contains(NOTICE_ERROR_CLASS), false);

  announce(region, 'Portada actualizada.', false, schedule);
  assert.equal(region.textContent, '', 'el mismo aviso vuelve a vaciarse para anunciarse otra vez');
  flush();
  assert.equal(region.textContent, 'Portada actualizada.');

  announce(region, 'No se pudo cambiar la portada.', true, schedule);
  flush();
  assert.equal(region.classList.contains(NOTICE_ERROR_CLASS), true, 'error');
  announce(region, 'Cambios guardados.', false, schedule);
  flush();
  assert.equal(region.classList.contains(NOTICE_ERROR_CLASS), false, 'un éxito quita la marca de error');

  assert.doesNotThrow(() => announce(null, 'Sin región', false, schedule));
});

test('Seguridad: (D2) el estudio del autor ya no usa confirm() del navegador: confirma con el diálogo y avisa con el componente', () => {
  const author = readFileSync(path.join(paths.clientDistDir, 'pages', 'author.js'), 'utf8');
  assert.equal(author.match(/\bconfirm\(/g), null, 'sin confirm() ni window.confirm()');
  assert.ok(author.includes(`from '../components/confirm-dialog.js'`), 'importa el componente');
  assert.equal(author.match(/\bconfirmAction\(/g)?.length, 3, 'retirar obra, retirar capítulo y eliminar viñeta');
});
