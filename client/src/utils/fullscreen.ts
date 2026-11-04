// Pantalla completa del lector (D24) con la API Fullscreen. Sin tocar `document` al importar: los tests
// unitarios cargan este módulo en Node y le pasan objetos con la misma forma.

export interface FullscreenDocument {
  readonly fullscreenEnabled: boolean;
  readonly fullscreenElement: unknown;
  exitFullscreen(): Promise<void>;
}

export interface FullscreenTarget {
  requestFullscreen(): Promise<void>;
}

export interface FullscreenButtonState {
  disabled: boolean;
  pressed: boolean;
  label: string; // texto visible y nombre accesible del botón
  title: string | null; // solo sin soporte
}

export const FULLSCREEN_LABELS = {
  enter: 'Pantalla completa',
  exit: 'Salir de pantalla completa',
  unsupported: 'No disponible en este navegador',
} as const;

// Estado del botón: se recalcula al cargar y en cada fullscreenchange (también al salir con Esc).
export function fullscreenButtonState(doc: Pick<FullscreenDocument, 'fullscreenEnabled' | 'fullscreenElement'>, target: unknown): FullscreenButtonState {
  if (!doc.fullscreenEnabled) {
    return { disabled: true, pressed: false, label: FULLSCREEN_LABELS.enter, title: FULLSCREEN_LABELS.unsupported };
  }
  const active = target !== null && doc.fullscreenElement === target;
  return { disabled: false, pressed: active, label: active ? FULLSCREEN_LABELS.exit : FULLSCREEN_LABELS.enter, title: null };
}

export type FullscreenResult = 'entered' | 'exited' | 'unsupported' | 'failed';

// Entra si la tira no está en pantalla completa y sale si lo está. El navegador puede negarse (permisos,
// iframe): entonces devuelve 'failed' y el botón no cambia, porque no llega ningún fullscreenchange.
export async function toggleFullscreen(doc: FullscreenDocument, target: FullscreenTarget): Promise<FullscreenResult> {
  if (!doc.fullscreenEnabled) return 'unsupported';
  try {
    if (doc.fullscreenElement === target) {
      await doc.exitFullscreen();
      return 'exited';
    }
    await target.requestFullscreen();
    return 'entered';
  } catch {
    return 'failed';
  }
}
