import { constants } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from 'express';
import { AppError } from '../../utils/app-error.js';
import { IMAGE_KEY_PATTERN } from '../../utils/image.js';
import { signExpiring, verifyExpiring } from '../../utils/signing.js';
import { assertImageKey, type StorageDriver } from './driver.js';

// Driver local: las imágenes viven en STORAGE_LOCAL_DIR (cualquier carpeta montada, NAS incluido) y se
// sirven por /files/:key?exp=&sig= con una firma HMAC de la clave y la caducidad (etiqueta `files`).

const nowSeconds = () => Math.floor(Date.now() / 1000);

export interface LocalStorageConfig {
  dir: string; // ruta absoluta
  ttlSeconds: number;
  signingKey: Buffer; // deriveKey(COOKIE_SECRET, 'files')
}

export function createLocalStorage(config: LocalStorageConfig): StorageDriver {
  return {
    name: 'local',
    async put(key, sourcePath) {
      assertImageKey(key);
      await mkdir(config.dir, { recursive: true });
      await copyFile(sourcePath, path.join(config.dir, key), constants.COPYFILE_EXCL); // nunca sobrescribe
    },
    async signedUrl(key) {
      assertImageKey(key);
      const exp = nowSeconds() + config.ttlSeconds;
      return `/files/${key}?exp=${exp}&sig=${signExpiring(config.signingKey, key, exp)}`;
    },
  };
}

// `exp` en su forma canónica (sin ceros a la izquierda): la firma se calculó sobre ese texto.
const EXP_PATTERN = /^[1-9]\d{0,14}$/;

// GET /files/:key (contrato del bloque 2). Sin zod a propósito: el contrato fija 404 para una clave no
// válida y 403 para firma o caducidad, no el 400 de la capa de validación. La clave se valida con la regex
// antes de tocar el disco; `root` impide además salir de la carpeta.
export function createLocalFilesHandler(config: Pick<LocalStorageConfig, 'dir' | 'signingKey'>): RequestHandler {
  return (req, res, next) => {
    const { key } = req.params;
    if (typeof key !== 'string' || !IMAGE_KEY_PATTERN.test(key)) {
      throw new AppError(404, 'NOT_FOUND', 'La imagen no existe');
    }

    const { exp, sig } = req.query;
    const now = nowSeconds();
    const check =
      typeof exp === 'string' && EXP_PATTERN.test(exp) && typeof sig === 'string'
        ? verifyExpiring(config.signingKey, key, Number(exp), sig, now)
        : 'invalid';
    if (check === 'invalid') throw new AppError(403, 'FORBIDDEN', 'El enlace de la imagen no es válido');
    if (check === 'expired') throw new AppError(403, 'FORBIDDEN', 'El enlace de la imagen ha caducado; recarga la página');

    res.sendFile(
      key,
      {
        root: config.dir,
        dotfiles: 'deny',
        cacheControl: false,
        lastModified: false,
        headers: { 'Cache-Control': `private, max-age=${Number(exp) - now}` }, // caché privada hasta exp
      },
      (err) => {
        if (!err || res.headersSent) return; // descarga cortada por el cliente: no hay nada que responder
        const status = (err as { status?: unknown }).status;
        next(status === 404 ? new AppError(404, 'NOT_FOUND', 'La imagen no existe') : err);
      },
    );
  };
}
