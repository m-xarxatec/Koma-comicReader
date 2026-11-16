import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TUTORIALS } from '../../config/tutorials.js';
import { api, startTestServer } from './helpers.js';

// Tutoriales (CU-42; contrato del bloque 6, D11–D13) con el respaldo local activo: TUTORIAL_VIDEOS_DIR apunta a una
// carpeta propia de este archivo.
const videosDir = mkdtempSync(path.join(tmpdir(), 'koma-tutorials-'));
process.env['TUTORIAL_VIDEOS_DIR'] = videosDir;
const VIDEO = 'abc_DEF-123.mp4';
const CONTENT = 'contenido de un vídeo de prueba';
writeFileSync(path.join(videosDir, VIDEO), CONTENT);
writeFileSync(path.join(videosDir, 'secreto.txt'), 'no es un vídeo');

const srv = startTestServer();
after(() => rm(videosDir, { recursive: true, force: true }));

test('Seguridad: (CU-42) GET /api/tutorials es público y devuelve la lista versionada, cada vídeo con id, título, descripción y local', async () => {
  const res = await api(srv, 'GET', '/api/tutorials');
  assert.equal(res.status, 200);
  const { tutorials } = (await res.json()) as { tutorials: { id: string; title: string; description: string; local: boolean }[] };
  assert.deepEqual(tutorials.map(({ local: _local, ...rest }) => rest), [...TUTORIALS]);
  for (const item of tutorials) assert.equal(item.local, false, 'ningún vídeo de la lista tiene archivo en la carpeta de prueba');
});

test('Seguridad: (CU-42) /videos/<id>.mp4 sirve el archivo local sin sesión, como vídeo y con Range (206)', async () => {
  const res = await fetch(`${srv.baseUrl}/videos/${VIDEO}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'video/mp4');
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  assert.equal(await res.text(), CONTENT);
  const partial = await fetch(`${srv.baseUrl}/videos/${VIDEO}`, { headers: { Range: 'bytes=0-8' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), `bytes 0-8/${Buffer.byteLength(CONTENT)}`);
  assert.equal(await partial.text(), 'contenido');
});

test('Seguridad: (CU-42) /videos solo admite <id>.mp4: un nombre no válido, otra extensión, un salto de carpeta o un vídeo que no está dan 404 sin tocar el disco', async () => {
  for (const file of ['zzzzzzzzzzz.mp4', 'secreto.txt', 'abc_DEF-123', 'abc_DEF-123.MP4', '..%2Fabc_DEF-123.mp4', '%2e%2e%2f%2e%2e%2fpackage.json', 'abc_DEF-123.mp4%00.txt']) {
    const res = await fetch(`${srv.baseUrl}/videos/${file}`, { redirect: 'manual' });
    assert.equal(res.status, 404, file);
    assert.ok(!(await res.text()).includes('no es un vídeo'), file);
  }
  assert.equal((await fetch(`${srv.baseUrl}/videos`)).status, 404);
});

test('Seguridad: (D12) la CSP solo admite marcos de youtube-nocookie.com', async () => {
  const csp = (await fetch(`${srv.baseUrl}/`)).headers.get('content-security-policy') ?? '';
  const frameSrc = csp.split(';').map((directive) => directive.trim()).find((directive) => directive.startsWith('frame-src'));
  assert.equal(frameSrc, 'frame-src https://www.youtube-nocookie.com');
});
