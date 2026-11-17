// Diálogo de confirmación y aviso flotante del estudio del autor (D2 del pulido), con el mismo mecanismo que /admin
// (pages/admin.ts): un <dialog> modal con method="dialog" que no envía nada al servidor, y una región role="status"
// al final de main. Las piezas llegan como parámetros (no se buscan al importar), así que se prueban sin navegador.

export interface ConfirmDialogParts {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  text: HTMLElement;
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
}

export interface ConfirmOptions {
  title: string;
  text: string;
  confirm: string;
  danger?: boolean;
}

export const NOTICE_ERROR_CLASS = 'floating-notice--error';

// Las cinco piezas del HTML (pages/author.html); null si falta alguna: entonces no se confirma nada.
export function confirmDialogParts(root: ParentNode = document): ConfirmDialogParts | null {
  const dialog = root.querySelector<HTMLDialogElement>('#confirm-dialog');
  const title = root.querySelector<HTMLElement>('#confirm-dialog-title');
  const text = root.querySelector<HTMLElement>('#confirm-dialog-text');
  const confirmButton = root.querySelector<HTMLButtonElement>('[data-confirm-dialog-confirm]');
  const cancelButton = root.querySelector<HTMLButtonElement>('[data-confirm-dialog-cancel]');
  if (!dialog || !title || !text || !confirmButton || !cancelButton) return null;
  return { dialog, title, text, confirmButton, cancelButton };
}

// Resuelve true solo si se pulsa Confirmar. La única salida es el evento close, sea cual sea la vía (Confirmar,
// Cancelar, Escape o un close() del navegador): cuenta como confirmación solo si returnValue es "confirm", el value
// del botón de envío de method="dialog". Los listeners de cada apertura cuelgan de un AbortController que se aborta
// al cerrar, así que ninguno sobrevive para resolver la acción de otra apertura. Con el diálogo ya abierto, o sin
// sus piezas, resuelve false sin tocar nada. El foco empieza en Cancelar y vuelve, al cerrar, al botón que lo abrió
// (lo hace el propio <dialog>).
export function confirmAction(parts: ConfirmDialogParts | null, options: ConfirmOptions): Promise<boolean> {
  if (!parts || parts.dialog.open) return Promise.resolve(false);
  const { dialog, title, text, confirmButton, cancelButton } = parts;
  title.textContent = options.title;
  text.textContent = options.text;
  confirmButton.textContent = options.confirm;
  // Peligro, como los «Retirar» del estudio: contorno con texto y borde del color de peligro (button.css).
  confirmButton.className = options.danger ? 'button button--outline button--danger' : 'button button--primary';
  dialog.returnValue = '';

  return new Promise((resolve) => {
    const listeners = new AbortController();
    const { signal } = listeners;
    cancelButton.addEventListener('click', () => dialog.close('cancel'), { signal });
    dialog.addEventListener(
      'close',
      () => {
        listeners.abort();
        resolve(dialog.returnValue === 'confirm');
      },
      { signal },
    );
    dialog.showModal();
    cancelButton.focus();
  });
}

// Aviso flotante de los resultados (éxito o error). Se vacía antes de escribir para que se anuncie también un aviso
// igual al anterior (p. ej. dos «Viñeta 2 eliminada.» seguidos); el texto llega en el siguiente fotograma.
export function announce(
  region: HTMLElement | null,
  message: string,
  error = false,
  schedule: (callback: () => void) => unknown = requestAnimationFrame,
): void {
  if (!region) return;
  region.textContent = '';
  schedule(() => {
    region.classList.toggle(NOTICE_ERROR_CLASS, error);
    region.textContent = message;
  });
}
