import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';
import { paths } from '../config/paths.js';
import { fillTemplate } from './html.js';

// Páginas de client/public/pages/ que puede servir el mapa de rutas (lista cerrada: nunca un nombre de la URL).
export type PageName = 'home';

// Los HTML salen siempre por aquí, nunca por express.static: se inyecta el requestId escapado.
export async function sendPage(res: Response, page: PageName): Promise<void> {
  const template = await readFile(path.join(paths.publicDir, 'pages', `${page}.html`), 'utf8');
  res
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(fillTemplate(template, { requestId: res.locals.requestId }));
}
