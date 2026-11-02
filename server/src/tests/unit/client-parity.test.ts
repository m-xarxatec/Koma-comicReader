import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';
import { EMAIL_MAX_CHARS, registerBody } from '../../modules/auth/auth.schema.js';
import { passwordProblem } from '../../utils/password.js';
import { safeNext } from '../../utils/redirect.js';

// El cliente duplica de forma explícita las reglas del servidor (no hay bundler: zod no llega al navegador).
// Este test carga el JS compilado del cliente (client/dist, lo genera `tsc -b`) y le pasa los mismos casos.

type Problem = (value: string) => string | null;
interface ClientValidate {
  emailProblem: Problem;
  displayNameProblem: Problem;
  passwordProblem: Problem;
  passwordConfirmProblem: (value: string, values: Readonly<Record<string, string>>) => string | null;
}
interface ClientRedirect {
  safeNext: (value: unknown) => string;
}

const load = <T>(file: string) => import(pathToFileURL(path.join(paths.clientDistDir, file)).href) as Promise<T>;
const client = await load<ClientValidate>('utils/validate.js');
const clientRedirect = await load<ClientRedirect>('utils/redirect.js');

test('RN-12: el cliente valida la contraseña igual que el servidor, con los mismos mensajes', () => {
  const cases = ['', '123456789', '1234567890', 'a'.repeat(72), 'a'.repeat(73), 'ñ'.repeat(36), 'ñ'.repeat(37), '🙂'.repeat(9), '🙂'.repeat(10), '🙂'.repeat(19)];
  for (const value of cases) assert.equal(client.passwordProblem(value), passwordProblem(value), JSON.stringify(value));
});

test('RN-12: el cliente acepta y rechaza los mismos correos que zod en el servidor', () => {
  // Frontera de EMAIL_MAX_CHARS: 254 caracteres es válido; 255, no.
  const longest = `${'x'.repeat(EMAIL_MAX_CHARS - 5)}@d.es`;
  const tooLong = `x${longest}`;
  assert.equal(longest.length, EMAIL_MAX_CHARS);
  assert.ok(registerBody.shape.email.safeParse(longest).success, 'el servidor acepta 254 caracteres');
  const cases = ['ana@demo.test', '  Ana@Demo.TEST ', 'a@b', 'a b@c.de', 'ñ@demo.test', 'a..b@c.de', '', longest, tooLong, 'o\'brien+koma@demo.test'];
  for (const value of cases) {
    assert.equal(client.emailProblem(value) === null, registerBody.shape.email.safeParse(value).success, JSON.stringify(value));
  }
});

test('RN-12: el cliente acepta y rechaza los mismos nombres visibles que el servidor', () => {
  const cases = ['Al', 'Ana', '  Ana  ', '   ', 'a'.repeat(30), 'a'.repeat(31), '🙂'.repeat(3), '🙂'.repeat(30), '🙂'.repeat(31)];
  for (const value of cases) {
    assert.equal(client.displayNameProblem(value) === null, registerBody.shape.displayName.safeParse(value).success, JSON.stringify(value));
  }
});

test('Seguridad: safeNext del cliente devuelve lo mismo que el del servidor', () => {
  const cases: unknown[] = ['/', '/perfil', '/leer/pimienta/3#v-4', '//evil', '/\\evil.com', 'https://x', 'javascript:alert(1)', '/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/perfil\u007f', '/\u0000', '', 'perfil', undefined, null, 42, ['/perfil']];
  for (const value of cases) assert.equal(clientRedirect.safeNext(value), safeNext(value), JSON.stringify(value));
});

// "Repite la contraseña" (maqueta): solo en el cliente, sin equivalente en el servidor ni en el contrato.
test('RN-12: repetir la contraseña se comprueba solo en el cliente: vacía u otra distinta → error', () => {
  const password = 'contraseña-larga-1';
  assert.equal(client.passwordConfirmProblem(password, { password }), null);
  assert.equal(client.passwordConfirmProblem('', { password }), 'Este campo es obligatorio');
  assert.equal(client.passwordConfirmProblem(`${password} `, { password }), 'Las contraseñas no coinciden');
  assert.equal(client.passwordConfirmProblem(password, {}), 'Las contraseñas no coinciden');
});
