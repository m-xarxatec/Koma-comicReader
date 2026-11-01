import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';
import { FOOTER_MARKER, HEADER_MARKER, renderTemplate } from '../../utils/layout.js';

// Todas las plantillas que sirve el servidor: páginas (sendPage) y errores (error-handler).
async function templates(): Promise<{ file: string; html: string }[]> {
  const result: { file: string; html: string }[] = [];
  for (const dir of ['pages', 'errors']) {
    for (const name of (await readdir(path.join(paths.publicDir, dir))).filter((file) => file.endsWith('.html'))) {
      result.push({ file: `${dir}/${name}`, html: await readFile(path.join(paths.publicDir, dir, name), 'utf8') });
    }
  }
  return result;
}

// Todos los valores que inyecta el servidor en alguna plantilla.
const VALUES = { requestId: '00000000-0000-4000-8000-000000000000', mode: 'login', title: 'Entrar', heading: 'Entrar' };
const count = (html: string, text: string) => html.split(text).length - 1;

test('Seguridad: cada plantilla lleva una vez cada marcador y ninguna copia propia de la cabecera o el pie', async () => {
  const all = await templates();
  assert.ok(all.length >= 7, `plantillas encontradas: ${all.length}`);
  for (const { file, html } of all) {
    assert.equal(count(html, HEADER_MARKER), 1, `${file}: ${HEADER_MARKER}`);
    assert.equal(count(html, FOOTER_MARKER), 1, `${file}: ${FOOTER_MARKER}`);
    assert.equal(count(html, 'class="site-header"'), 0, `${file}: cabecera copiada`);
    assert.equal(count(html, 'class="site-footer"'), 0, `${file}: pie copiado`);
  }
});

test('Seguridad: ninguna plantilla sale con un marcador sin sustituir', async () => {
  for (const { file, html } of await templates()) {
    const rendered = renderTemplate(html, VALUES);
    assert.equal(count(rendered, '<!-- @'), 0, `${file}: marcador de layout`);
    assert.equal(count(rendered, '{{'), 0, `${file}: valor sin rellenar`);
    for (const part of ['class="skip-link"', 'class="site-header"', 'class="site-footer"', 'src="/js/components/header.js"']) {
      assert.equal(count(rendered, part), 1, `${file}: ${part}`);
    }
  }
});
