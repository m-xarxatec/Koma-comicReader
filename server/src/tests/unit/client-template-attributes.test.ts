import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { paths } from '../../config/paths.js';

// Integración de E3 (Codex, 18-nov): author.html traía `content ="…"` y `aria-controls ="…"`, con un espacio antes
// del `=`, que solo servía para que la búsqueda `on[a-z]+=` del encargo no encontrara «ontent=» ni «ontrols=».
// Es HTML válido, pero esconde los atributos a esas búsquedas y a los tests que buscan `nombre="valor"`.

const templates = ['pages', 'errors'].flatMap((dir) =>
  readdirSync(path.join(paths.publicDir, dir))
    .filter((name) => name.endsWith('.html'))
    .map((name) => ({ name: `${dir}/${name}`, html: readFileSync(path.join(paths.publicDir, dir, name), 'utf8') })),
);

test('Seguridad: en las plantillas HTML, los atributos van sin espacios alrededor del = (nombre="valor")', () => {
  const spaced = templates.flatMap(({ name, html }) =>
    [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<[a-zA-Z][^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => /\s=|=\s/.test(tag))
      .map((tag) => `${name}: ${tag}`),
  );
  assert.deepEqual(spaced, []);
});
