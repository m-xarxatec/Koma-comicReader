import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDemoTarget, type DemoTargetInput } from '../../scripts/demo-guard.js';

// `npm run demo:data` solo escribe en una BD local de desarrollo, con los drivers locales.

const LOCAL: DemoTargetInput = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://koma:koma@localhost:5432/koma',
  STORAGE_DRIVER: 'local',
  PAYMENTS_DRIVER: 'fake',
};

test('Seguridad: demo:data acepta una BD local de desarrollo (localhost, 127.0.0.1 y ::1)', () => {
  assert.deepEqual(checkDemoTarget(LOCAL), { ok: true, dbHost: 'localhost', dbName: 'koma' });
  for (const host of ['127.0.0.1', '[::1]']) {
    const target = checkDemoTarget({ ...LOCAL, DATABASE_URL: `postgres://koma:koma@${host}:5432/koma` });
    assert.equal(target.ok, true, host);
  }
});

test('Seguridad: demo:data aborta en producción o sin NODE_ENV', () => {
  for (const NODE_ENV of ['production', undefined]) {
    const target = checkDemoTarget({ ...LOCAL, NODE_ENV });
    assert.equal(target.ok, false, String(NODE_ENV));
    assert.match(target.ok ? '' : target.reason, /NODE_ENV/);
  }
});

test('Seguridad: demo:data aborta con un host remoto (Neon, el contenedor db u otra máquina)', () => {
  for (const url of [
    'postgres://koma:x@ep-cool-name-123456.eu-central-1.aws.neon.tech/koma?sslmode=verify-full',
    'postgres://koma:koma@db:5432/koma',
    'postgres://koma:koma@192.168.1.20:5432/koma',
    'postgres://koma:koma@localhost.evil.com:5432/koma',
  ]) {
    const target = checkDemoTarget({ ...LOCAL, DATABASE_URL: url });
    assert.equal(target.ok, false, url);
    assert.match(target.ok ? '' : target.reason, /no es local/, url);
  }
});

test('Seguridad: demo:data aborta con la BD de tests (_test), sin nombre de BD o sin una URL válida', () => {
  const cases: [string | undefined, RegExp][] = [
    ['postgres://koma:koma@localhost:5432/koma_test', /tests/],
    ['postgres://koma:koma@localhost:5432/', /no nombra/],
    ['no es una url', /no es una URL/],
    [undefined, /no es una URL/],
  ];
  for (const [DATABASE_URL, reason] of cases) {
    const target = checkDemoTarget({ ...LOCAL, DATABASE_URL });
    assert.equal(target.ok, false, String(DATABASE_URL));
    assert.match(target.ok ? '' : target.reason, reason, String(DATABASE_URL));
  }
});

test('Seguridad: demo:data aborta con drivers que no son locales (R2 o Stripe)', () => {
  const storage = checkDemoTarget({ ...LOCAL, STORAGE_DRIVER: 'r2' });
  assert.equal(storage.ok, false);
  assert.match(storage.ok ? '' : storage.reason, /STORAGE_DRIVER/);
  const payments = checkDemoTarget({ ...LOCAL, PAYMENTS_DRIVER: 'stripe' });
  assert.equal(payments.ok, false);
  assert.match(payments.ok ? '' : payments.reason, /PAYMENTS_DRIVER/);
});
