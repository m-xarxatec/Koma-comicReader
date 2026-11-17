import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';

// Diálogo de confirmación del estudio del autor (pulido, D2: <dialog> en lugar de confirm()). Se carga el componente
// compilado (client/dist) y se le pasa un <dialog> simulado: solo cuenta como confirmación cerrar con "confirm".

interface Options {
  title: string;
  text: string;
  confirm: string;
  danger?: boolean;
}
interface ClientConfirm {
  confirmDialog: (dialog: unknown, options: Options) => Promise<boolean>;
}

const load = <T>(file: string) => import(pathToFileURL(path.join(paths.clientDistDir, file)).href) as Promise<T>;
const { confirmDialog } = await load<ClientConfirm>('components/confirm-dialog.js');

class FakeElement extends EventTarget {
  textContent = '';
  className = '';
  focused = 0;
  focus(): void {
    this.focused += 1;
  }
  click(): void {
    this.dispatchEvent(new Event('click'));
  }
}

class FakeDialog extends EventTarget {
  open = false;
  returnValue = '';
  shown = 0;
  parts: Record<string, FakeElement> = {
    '[data-dialog-title]': new FakeElement(),
    '[data-dialog-text]': new FakeElement(),
    '[data-dialog-cancel]': new FakeElement(),
    '[data-dialog-confirm]': new FakeElement(),
  };
  querySelector(selector: string): FakeElement | null {
    return this.parts[selector] ?? null;
  }
  showModal(): void {
    this.open = true;
    this.shown += 1;
  }
  // Como el navegador: close(valor) fija returnValue; sin valor (Escape) lo deja como estaba.
  close(value?: string): void {
    if (value !== undefined) this.returnValue = value;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
}

const OPTIONS: Options = { title: 'Retirar obra', text: '«Mi obra» dejará de verse.', confirm: 'Retirar', danger: true };

test('Seguridad: el diálogo del estudio solo confirma si se cierra con «confirm»; pinta sus textos y abre como modal', async () => {
  const dialog = new FakeDialog();
  const pending = confirmDialog(dialog, OPTIONS);
  assert.equal(dialog.shown, 1);
  assert.equal(dialog.parts['[data-dialog-title]']?.textContent, 'Retirar obra');
  assert.equal(dialog.parts['[data-dialog-text]']?.textContent, '«Mi obra» dejará de verse.');
  assert.equal(dialog.parts['[data-dialog-confirm]']?.textContent, 'Retirar');
  assert.equal(dialog.parts['[data-dialog-confirm]']?.className, 'button button--outline button--danger');
  assert.equal(dialog.parts['[data-dialog-cancel]']?.focused, 1, 'el foco empieza en «Cancelar»');
  dialog.close('confirm'); // el botón de envío de method="dialog"
  assert.equal(await pending, true);

  const plain = confirmDialog(dialog, { title: 'Enviar', text: 'Se enviará.', confirm: 'Enviar' });
  assert.equal(dialog.parts['[data-dialog-confirm]']?.className, 'button button--primary');
  dialog.close('confirm');
  assert.equal(await plain, true);
});

test('Seguridad: «Cancelar», Escape o un cierre sin valor no confirman, aunque la vez anterior se confirmara', async () => {
  const dialog = new FakeDialog();
  const first = confirmDialog(dialog, OPTIONS);
  dialog.close('confirm');
  assert.equal(await first, true);

  const escaped = confirmDialog(dialog, OPTIONS);
  dialog.close(); // Escape: el navegador no cambia returnValue
  assert.equal(await escaped, false, 'el «confirm» de la apertura anterior no vale para esta');

  const cancelled = confirmDialog(dialog, OPTIONS);
  dialog.parts['[data-dialog-cancel]']?.click();
  assert.equal(await cancelled, false);
  assert.equal(dialog.open, false, '«Cancelar» cierra el diálogo');
});

test('Seguridad: sin diálogo, con una pieza que falta o con el diálogo ya abierto no se confirma nada', async () => {
  assert.equal(await confirmDialog(null, OPTIONS), false);
  const broken = new FakeDialog();
  delete broken.parts['[data-dialog-confirm]'];
  assert.equal(await confirmDialog(broken, OPTIONS), false);
  assert.equal(broken.shown, 0);

  const dialog = new FakeDialog();
  const first = confirmDialog(dialog, OPTIONS);
  assert.equal(await confirmDialog(dialog, { ...OPTIONS, title: 'Otra acción' }), false, 'una segunda apertura no sustituye a la primera');
  assert.equal(dialog.parts['[data-dialog-title]']?.textContent, 'Retirar obra');
  dialog.close('confirm');
  assert.equal(await first, true);
});

test('Seguridad: los listeners de una apertura no sobreviven: «Cancelar» de una apertura ya cerrada no cierra la siguiente', async () => {
  const dialog = new FakeDialog();
  const first = confirmDialog(dialog, OPTIONS);
  dialog.close('confirm');
  await first;
  const second = confirmDialog(dialog, OPTIONS);
  let closes = 0;
  dialog.addEventListener('close', () => (closes += 1));
  dialog.parts['[data-dialog-cancel]']?.click();
  assert.equal(closes, 1, 'un solo cierre: el listener de la primera apertura ya no existe');
  assert.equal(await second, false);
});
