import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';
import { paths } from '../config/paths.js';
import { renderTemplate } from './layout.js';

// Páginas de client/public/pages/ que puede servir el mapa de rutas (lista cerrada: nunca un nombre de la URL).
export type PageName = 'home' | 'auth' | 'comic' | 'reader';

// Los HTML salen siempre por aquí, nunca por express.static. Se ponen la cabecera y el pie comunes
// (layout.ts, con la página activa según la ruta) y se inyectan el requestId y los valores de la página,
// siempre escapados.
export async function sendPage(res: Response, page: PageName, values: Readonly<Record<string, string>> = {}): Promise<void> {
  const template = await readFile(path.join(paths.publicDir, 'pages', `${page}.html`), 'utf8');
  res
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(renderTemplate(template, { ...values, requestId: res.locals.requestId }, res.req.path));
}
