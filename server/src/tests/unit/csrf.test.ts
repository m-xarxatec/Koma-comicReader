import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedOrigin, isValidOrigin } from '../../utils/origin.js';

const DEV = new Set(['http://localhost:3000']);
const LAN = new Set(['http://koma.local', 'http://localhost']); // la lista de docker-compose.yml

test('Seguridad: CSRF acepta un Origin de la lista', () => {
  assert.equal(isAllowedOrigin('http://localhost:3000', DEV), true);
});

test('Seguridad: CSRF rechaza un Origin ajeno', () => {
  for (const origin of ['http://evil.test', 'http://localhost:3001', 'https://localhost:3000', 'http://localhost:3000.evil.test', 'null']) {
    assert.equal(isAllowedOrigin(origin, DEV), false, origin);
  }
});

test('Seguridad: CSRF rechaza la petición sin Origin', () => {
  assert.equal(isAllowedOrigin(undefined, DEV), false);
  assert.equal(isAllowedOrigin('', DEV), false);
});

test('Seguridad: CSRF acepta cada origen de una lista con varios y solo esos', () => {
  assert.equal(isAllowedOrigin('http://koma.local', LAN), true);
  assert.equal(isAllowedOrigin('http://localhost', LAN), true);
  for (const origin of ['http://koma.local:3000', 'https://koma.local', 'http://localhost:3000', 'http://evil.test']) {
    assert.equal(isAllowedOrigin(origin, LAN), false, origin);
  }
});

test('Seguridad: ALLOWED_ORIGINS solo admite orígenes exactos', () => {
  for (const origin of ['http://koma.local', 'http://localhost:3000', 'https://koma.onrender.com', 'http://192.168.1.10']) {
    assert.equal(isValidOrigin(origin), true, origin);
  }
  for (const origin of [
    'http://koma.local/', // barra final
    'http://localhost:3000/api', // ruta
    'http://*.local', // comodín
    '*',
    'http://Koma.local', // el navegador lo envía en minúsculas
    'http://localhost:80', // el navegador omite el puerto por defecto
    'http://user@koma.local', // credenciales
    'ftp://koma.local',
    'koma.local',
    'null',
    '',
  ]) {
    assert.equal(isValidOrigin(origin), false, origin);
  }
});
