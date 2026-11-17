import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkActivityTarget, isDemoEmail, type ActivityTargetInput } from '../../scripts/demo-activity-guard.js';

// Guarda de la actividad simulada (idea 24; «Pulido», D14–D21): dónde puede lanzarse cada comando y con qué cuentas.

const PASSWORD = 'contraseña-demo-1';
const LOCAL: ActivityTargetInput = { mode: 'local', appUrl: 'http://localhost:3000', password: PASSWORD };
const ONLINE: ActivityTargetInput = { mode: 'online', appUrl: 'https://koma.example.com', confirm: 'koma.example.com', password: PASSWORD };
const reason = (input: ActivityTargetInput) => {
  const target = checkActivityTarget(input);
  return target.ok ? '' : target.reason;
};

test('Seguridad: demo:activity acepta http en localhost, 127.0.0.1 y koma.local, y devuelve el origen de APP_URL', () => {
  assert.deepEqual(checkActivityTarget(LOCAL), { ok: true, origin: 'http://localhost:3000', host: 'localhost' });
  assert.deepEqual(checkActivityTarget({ ...LOCAL, appUrl: 'http://127.0.0.1:3000/' }), { ok: true, origin: 'http://127.0.0.1:3000', host: '127.0.0.1' });
  assert.deepEqual(checkActivityTarget({ ...LOCAL, appUrl: 'http://koma.local' }), { ok: true, origin: 'http://koma.local', host: 'koma.local' });
});

test('Seguridad: demo:activity aborta con https, con un host que no es local o con --confirm', () => {
  assert.match(reason({ ...LOCAL, appUrl: 'https://localhost:3000' }), /http/);
  for (const appUrl of ['http://koma.example.com', 'http://localhost.evil.example', 'http://koma.local.evil.example', 'http://192.168.1.20:3000', 'http://[::1]:3000']) {
    assert.match(reason({ ...LOCAL, appUrl }), /local/, appUrl);
  }
  assert.match(reason({ ...LOCAL, confirm: 'localhost' }), /--confirm/);
});

test('Seguridad: demo:activity:online exige https y --confirm igual al host de APP_URL', () => {
  assert.deepEqual(checkActivityTarget(ONLINE), { ok: true, origin: 'https://koma.example.com', host: 'koma.example.com' });
  assert.match(reason({ ...ONLINE, appUrl: 'http://koma.example.com' }), /https/);
  assert.match(reason({ ...ONLINE, confirm: undefined }), /--confirm/);
  for (const confirm of ['', 'otro.example.com', 'KOMA.example.com.evil', 'https://koma.example.com', 'koma.example.com:443']) {
    assert.match(reason({ ...ONLINE, confirm }), /--confirm/, confirm);
  }
  // Un host local nunca es «online», aunque lleve https y se confirme.
  assert.match(reason({ ...ONLINE, appUrl: 'https://localhost', confirm: 'localhost' }), /local/);
});

test('Seguridad: la actividad simulada aborta sin APP_URL válida, con credenciales en la URL o sin contraseña', () => {
  for (const appUrl of [undefined, '', 'koma.local', 'ftp://localhost', 'javascript:alert(1)']) {
    assert.match(reason({ ...LOCAL, appUrl }), /APP_URL/, String(appUrl));
  }
  assert.match(reason({ ...LOCAL, appUrl: 'http://admin:secreto@localhost:3000' }), /APP_URL/);
  for (const password of [undefined, '', 'corta']) {
    assert.match(reason({ ...LOCAL, password }), /SEED_READER_PASSWORD/, String(password));
  }
  // El motivo nunca repite la contraseña.
  assert.ok(!reason({ ...LOCAL, appUrl: 'https://localhost', password: PASSWORD }).includes(PASSWORD));
});

test('Seguridad: la actividad simulada solo usa correos @demo.test', () => {
  for (const email of ['actividad1@demo.test', 'actividad6@demo.test']) assert.equal(isDemoEmail(email), true, email);
  for (const email of ['ana@gmail.com', 'actividad1@demo.test.evil.com', 'actividad1@DEMO.test', 'actividad1@demo.test ', '@demo.test', 'a@b@demo.test', 'demo.test']) {
    assert.equal(isDemoEmail(email), false, email);
  }
});
