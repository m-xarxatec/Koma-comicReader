import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { requireAdmin, requireAuth, requireAuthor } from '../../middlewares/roles.js';
import { canLogIn, chapterAccess, isAdmin, isAuthor, isPremium, isSessionValid, type PermissionSubject } from '../../modules/auth/permissions.js';
import { AppError } from '../../utils/app-error.js';

const reader: PermissionSubject = { role: 'user', isAuthor: false, status: 'active', tokenVersion: 3, premiumUntil: null };
const author: PermissionSubject = { ...reader, isAuthor: true };
const admin: PermissionSubject = { ...reader, role: 'admin' };
const now = new Date('2026-11-01T12:00:00Z');

test('Seguridad: solo role=admin es admin; un admin nunca es autor aunque tenga is_author', () => {
  assert.equal(isAdmin(admin), true);
  assert.equal(isAdmin(author), false);
  assert.equal(isAuthor(author), true);
  assert.equal(isAuthor(reader), false);
  assert.equal(isAuthor({ ...admin, isAuthor: true }), false);
});

test('Seguridad: es premium solo si premium_until es posterior a ahora', () => {
  assert.equal(isPremium(reader, now), false);
  assert.equal(isPremium({ ...reader, premiumUntil: new Date('2026-11-01T12:00:01Z') }, now), true);
  assert.equal(isPremium({ ...reader, premiumUntil: new Date('2026-11-01T12:00:00Z') }, now), false);
});

test('RN-15: la sesión vale solo con la cuenta activa y su token_version actual', () => {
  assert.equal(isSessionValid(reader, 3), true);
  assert.equal(isSessionValid(reader, 2), false); // contraseña, rol o estado cambiados
  assert.equal(isSessionValid({ ...reader, status: 'suspended' }, 3), false);
  assert.equal(isSessionValid(null, 3), false); // la cuenta ya no existe
});

test('Seguridad: una cuenta suspendida no puede iniciar sesión', () => {
  assert.equal(canLogIn(reader), true);
  assert.equal(canLogIn({ ...reader, status: 'suspended' }), false);
});

// Ejecuta un middleware de roles con el usuario dado y devuelve el AppError lanzado (o null si deja pasar).
function run(middleware: typeof requireAuth, user: PermissionSubject | null): AppError | null {
  const res = { locals: { user } } as unknown as Response;
  let passed = false;
  try {
    middleware({} as Request, res, (() => (passed = true)) as NextFunction);
  } catch (err) {
    assert.ok(err instanceof AppError);
    return err;
  }
  assert.equal(passed, true);
  return null;
}

test('Seguridad: requireAuth, requireAdmin y requireAuthor: 401 sin sesión, 403 sin el rol', () => {
  assert.equal(run(requireAuth, null)?.code, 'UNAUTHENTICATED');
  assert.equal(run(requireAuth, reader), null);

  assert.equal(run(requireAdmin, null)?.code, 'UNAUTHENTICATED');
  assert.equal(run(requireAdmin, author)?.code, 'FORBIDDEN');
  assert.equal(run(requireAdmin, admin), null);

  assert.equal(run(requireAuthor, null)?.code, 'UNAUTHENTICATED');
  assert.equal(run(requireAuthor, reader)?.code, 'FORBIDDEN');
  assert.equal(run(requireAuthor, admin)?.code, 'FORBIDDEN');
  assert.equal(run(requireAuthor, author), null);
});

// `access` de la ficha (contrato del bloque 2): qué exige cada capítulo a quien lo consulta.
const chapter = (number: number, extra: { alreadyRead?: boolean; ownsComic?: boolean } = {}) => ({
  number,
  alreadyRead: extra.alreadyRead ?? false,
  ownsComic: extra.ownsComic ?? false,
});

test('RN-01: el invitado lee libres los caps. 1–2, el 3 tras un anuncio y desde el 4 necesita cuenta', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 50].map((number) => chapterAccess(null, chapter(number), now)),
    ['free', 'free', 'ad', 'account', 'account'],
  );
});

test('RN-02: el registrado gasta saldo desde el cap. 3, salvo en lo que ya leyó', () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((number) => chapterAccess(reader, chapter(number), now)),
    ['free', 'free', 'balance', 'balance'],
  );
  assert.equal(chapterAccess(reader, chapter(3, { alreadyRead: true }), now), 'free');
  // Con el premium vencido, vuelve a las reglas de registrado (RN-04).
  assert.equal(chapterAccess({ ...reader, premiumUntil: now }, chapter(3), now), 'balance');
});

test('Seguridad: premium, admin y el autor en su propia obra leen todo libre; en una obra ajena, el autor gasta saldo', () => {
  const premium = { ...reader, premiumUntil: new Date('2026-12-01T00:00:00Z') };
  for (const [name, user, extra] of [
    ['premium', premium, {}],
    ['admin', admin, {}],
    ['autor dueño', author, { ownsComic: true }],
  ] as const) {
    assert.equal(chapterAccess(user, chapter(3, extra), now), 'free', name);
    assert.equal(chapterAccess(user, chapter(40, extra), now), 'free', name);
  }
  assert.equal(chapterAccess(author, chapter(3), now), 'balance');
});
