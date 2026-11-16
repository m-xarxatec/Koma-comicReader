import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, startTestServer } from './helpers.js';

// Tutoriales sin respaldo local (como online): sin TUTORIAL_VIDEOS_DIR, /videos no existe y ningún vídeo es local.
delete process.env['TUTORIAL_VIDEOS_DIR'];
const srv = startTestServer();

test('Seguridad: (D13) sin TUTORIAL_VIDEOS_DIR, /videos/<id>.mp4 no existe (404) y la lista marca todos los vídeos como no locales', async () => {
  assert.equal((await fetch(`${srv.baseUrl}/videos/abc_DEF-123.mp4`)).status, 404);
  const res = await api(srv, 'GET', '/api/tutorials');
  assert.equal(res.status, 200);
  const { tutorials } = (await res.json()) as { tutorials: { local: boolean }[] };
  assert.ok(Array.isArray(tutorials));
  assert.ok(tutorials.every((item) => item.local === false));
});
