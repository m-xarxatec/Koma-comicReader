import { IMAGE_KEY_PATTERN } from '../../utils/image.js';

// Misma interfaz para los dos drivers (CLAUDE.md, "integrations/"): local y online solo cambian STORAGE_DRIVER.
export interface StorageDriver {
  readonly name: 'local' | 'r2';
  // Copia al almacenamiento un archivo que ya está en disco (content/ al importar, el temporal de multer al
  // subir): nunca se carga entero en memoria para guardarlo (RN-10).
  put(key: string, sourcePath: string, contentType: string): Promise<void>;
  // URL firmada que caduca a los SIGNED_URL_TTL_SECONDS: ninguna imagen tiene URL pública permanente.
  signedUrl(key: string): Promise<string>;
  // Borra la imagen (viñeta de un borrador o portada sustituida). Idempotente: si ya no existe, no falla.
  remove(key: string): Promise<void>;
}

// Defensa en profundidad: el driver solo acepta claves UUID.ext, aunque el llamador ya las genere así.
export function assertImageKey(key: string): void {
  if (!IMAGE_KEY_PATTERN.test(key)) throw new Error(`Clave de almacenamiento no válida: ${JSON.stringify(key)}`);
}
