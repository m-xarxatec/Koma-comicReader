// Diálogo de confirmación sobre un <dialog> (estudio del autor; pulido, D2), en lugar de confirm(). El HTML lleva
// dentro un <form method="dialog"> con [data-dialog-title], [data-dialog-text], [data-dialog-cancel] (type="button")
// y [data-dialog-confirm] (type="submit" value="confirm").

export interface ConfirmOptions {
  title: string;
  text: string;
  confirm: string; // texto del botón que confirma
  danger?: boolean; // acción que no se deshace: el botón va en rojo
}

// Resuelve true solo si el diálogo se cierra con returnValue "confirm" (el value del botón de envío). «Cancelar»,
// Escape o cualquier otro cierre resuelven false. La única salida es el evento close; los listeners de cada apertura
// cuelgan de un AbortController que se aborta al cerrar, así ninguno sobrevive para resolver otra apertura. El foco
// vuelve al botón que lo abrió (lo hace el propio <dialog> al cerrarse).
export function confirmDialog(dialog: HTMLDialogElement | null, options: ConfirmOptions): Promise<boolean> {
  if (!dialog || dialog.open) return Promise.resolve(false);
  const title = dialog.querySelector<HTMLElement>('[data-dialog-title]');
  const text = dialog.querySelector<HTMLElement>('[data-dialog-text]');
  const cancel = dialog.querySelector<HTMLButtonElement>('[data-dialog-cancel]');
  const confirm = dialog.querySelector<HTMLButtonElement>('[data-dialog-confirm]');
  if (!title || !text || !cancel || !confirm) return Promise.resolve(false);

  title.textContent = options.title;
  text.textContent = options.text;
  confirm.textContent = options.confirm;
  confirm.className = options.danger ? 'button button--outline button--danger' : 'button button--primary';
  dialog.returnValue = ''; // Escape no cambia returnValue: sin esto valdría el «confirm» de la apertura anterior

  return new Promise((resolve) => {
    const listeners = new AbortController();
    const { signal } = listeners;
    cancel.addEventListener('click', () => dialog.close('cancel'), { signal });
    dialog.addEventListener(
      'close',
      () => {
        listeners.abort();
        resolve(dialog.returnValue === 'confirm');
      },
      { signal },
    );
    dialog.showModal();
    cancel.focus(); // lo seguro por defecto: Intro no confirma sin querer
  });
}
