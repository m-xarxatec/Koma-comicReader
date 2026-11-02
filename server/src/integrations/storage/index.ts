import path from 'node:path';
import { env } from '../../config/env.js';
import { paths } from '../../config/paths.js';
import { deriveKey } from '../../utils/signing.js';
import type { StorageDriver } from './driver.js';
import { createLocalFilesHandler, createLocalStorage } from './local.js';
import { createR2Storage } from './r2.js';

// Driver activo según STORAGE_DRIVER. Es el único archivo de storage que lee el entorno: local.ts y r2.ts
// reciben su configuración y se prueban sin .env.

export type { StorageDriver } from './driver.js';

// Relativa a la raíz del repositorio (./storage en local); absoluta en Docker (/app/storage).
const localDir = path.resolve(paths.root, env.STORAGE_LOCAL_DIR);
const filesKey = deriveKey(env.COOKIE_SECRET, 'files');

export const storage: StorageDriver =
  env.STORAGE_DRIVER === 'r2'
    ? createR2Storage({
        // env.ts exige las cuatro R2_* con STORAGE_DRIVER=r2: aquí nunca faltan.
        accountId: env.R2_ACCOUNT_ID!,
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
        bucket: env.R2_BUCKET!,
        ttlSeconds: env.SIGNED_URL_TTL_SECONDS,
      })
    : createLocalStorage({ dir: localDir, ttlSeconds: env.SIGNED_URL_TTL_SECONDS, signingKey: filesKey });

// GET /files/:key solo existe con el driver local; con r2 las URLs son prefirmadas de R2.
export const filesHandler = env.STORAGE_DRIVER === 'local' ? createLocalFilesHandler({ dir: localDir, signingKey: filesKey }) : null;
