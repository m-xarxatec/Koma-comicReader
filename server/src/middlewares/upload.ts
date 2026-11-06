import os from 'node:os';
import multer from 'multer';
import { MAX_IMAGE_BYTES } from '../config/limits.js';

// Subida de una imagen (RN-10; contrato del bloque 3, "Errores de las subidas"). multer en disco, nunca en
// memoria: el archivo va a os.tmpdir() con un nombre aleatorio de multer (sin el del cliente) y el servicio lo
// copia al almacenamiento y lo borra siempre (`finally`). Un solo archivo en el campo `image`, sin campos de texto
// y 5 MB como mucho. Los errores de multer los traduce error-handler.ts (413 FILE_TOO_LARGE o 400); si corta la
// subida, multer borra el archivo parcial antes de pasar el error.
//
// Va después de requireAuthor, del limitador de subidas y de la comprobación de la obra: un 401, 403, 404, 410 o
// 429 no escribe nada en disco. Una petición que no es multipart/form-data pasa sin archivo (400 en fields.image).
// La carpeta se pide en cada subida (y no al cargar el módulo) para que los tests puedan fijar TMPDIR.
export const uploadImage = multer({
  storage: multer.diskStorage({ destination: (_req, _file, cb) => cb(null, os.tmpdir()) }),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 1 },
}).single('image');
