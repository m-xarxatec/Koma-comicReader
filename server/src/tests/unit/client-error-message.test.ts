import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';

// Cierre del bloque 6 (/simplify, 18-nov): el mensaje de un error de la API con su código de referencia estaba escrito
// a mano en varias páginas. Ahora sale de una sola función de services/api.ts. Se carga el JS compilado (client/dist).
// community.ts queda fuera (lo rediseña Codex en otra rama) y comic.ts compone otro mensaje.

interface ClientApi {
  errorMessage: (error: { code: string; message: string; requestId: string }) => string;
}
const load = () => import(pathToFileURL(path.join(paths.clientDistDir, 'services', 'api.js')).href) as Promise<ClientApi>;

test('Seguridad: errorMessage da el mensaje de la API con su código de referencia, o solo el mensaje si no lo trae', async () => {
  const { errorMessage } = await load();
  assert.equal(errorMessage({ code: 'INTERNAL_ERROR', message: 'Algo ha fallado', requestId: 'abc-123' }), 'Algo ha fallado (código de referencia: abc-123)');
  assert.equal(errorMessage({ code: 'NOT_FOUND', message: 'No existe', requestId: '' }), 'No existe');
});

test('Seguridad: tutoriales, admin, premium, pago simulado y perfil usan errorMessage, sin su propia copia del mensaje', () => {
  for (const page of ['tutorials', 'admin', 'premium', 'fake-checkout', 'profile']) {
    const js = readFileSync(path.join(paths.clientDistDir, 'pages', `${page}.js`), 'utf8');
    assert.ok(!js.includes('código de referencia'), `${page}.js sin la copia`);
    assert.match(js, /import \{[^}]*\berrorMessage\b[^}]*\} from '\.\.\/services\/api\.js'/, `${page}.js importa errorMessage`);
  }
});
