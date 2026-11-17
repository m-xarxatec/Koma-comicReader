import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';
import { TUTORIALS, YOUTUBE_ID_PATTERN } from '../../config/tutorials.js';

// Direcciones de los reproductores de /tutoriales (client/dist, lo genera `tsc -b`): funciones puras del cliente.
// El id llega de GET /api/tutorials y se vuelve a validar antes de montar una URL con él (contrato del bloque 6, D12 y D13).

interface ClientTutorials {
  YOUTUBE_ID_PATTERN: RegExp;
  embedUrl: (id: string) => string | null;
  localVideoUrl: (id: string) => string | null;
}

const load = <T>(file: string) => import(pathToFileURL(path.join(paths.clientDistDir, file)).href) as Promise<T>;
const client = await load<ClientTutorials>('utils/tutorials.js');

const BAD_IDS = ['', 'corto', 'XeIR7P82aPU0', 'XeIR7P82aP/', '../../admin', 'XeIR7P82aP?', 'XeIR7P82a U', 'javascript:', 'XeIR7P82aPU\n'];

test('Seguridad: (D12) embedUrl monta la dirección de youtube-nocookie.com solo con un id válido', () => {
  assert.equal(client.embedUrl('XeIR7P82aPU'), 'https://www.youtube-nocookie.com/embed/XeIR7P82aPU');
  assert.equal(client.embedUrl('t-8FuHla3H0'), 'https://www.youtube-nocookie.com/embed/t-8FuHla3H0');
  for (const id of BAD_IDS) assert.equal(client.embedUrl(id), null, JSON.stringify(id));
});

test('Seguridad: (D13) localVideoUrl monta /videos/<id>.mp4 solo con un id válido', () => {
  assert.equal(client.localVideoUrl('AmoW_LqwQ40'), '/videos/AmoW_LqwQ40.mp4');
  for (const id of BAD_IDS) assert.equal(client.localVideoUrl(id), null, JSON.stringify(id));
});

test('Seguridad: (D11) el cliente repite el patrón de id del servidor y admite todos los vídeos de la lista', () => {
  assert.equal(client.YOUTUBE_ID_PATTERN.source, YOUTUBE_ID_PATTERN.source);
  assert.equal(client.YOUTUBE_ID_PATTERN.flags, YOUTUBE_ID_PATTERN.flags);
  for (const { id } of TUTORIALS) {
    assert.equal(client.embedUrl(id), `https://www.youtube-nocookie.com/embed/${id}`, id);
    assert.equal(client.localVideoUrl(id), `/videos/${id}.mp4`, id);
  }
});
