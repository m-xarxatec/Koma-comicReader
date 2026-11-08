import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { redirectAuthorToStudio, requireAdmin, requireAuth, requireAuthor } from '../../middlewares/roles.js';
import {
  canComment,
  canDeleteOwnComment,
  canLogIn,
  canManageComic,
  canPreviewComic,
  canWithdrawComic,
  chapterAccess,
  isAdmin,
  isAuthor,
  isPremium,
  isSessionValid,
  type PermissionSubject,
} from '../../modules/auth/permissions.js';
import { AppError } from '../../utils/app-error.js';

const reader: PermissionSubject = { id: 1, role: 'user', isAuthor: false, status: 'active', tokenVersion: 3, premiumUntil: null };
const author: PermissionSubject = { ...reader, id: 2, isAuthor: true };
const admin: PermissionSubject = { ...reader, id: 3, role: 'admin' };
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

test('Seguridad: redirectAuthorToStudio (/crear) lleva al autor a /autor con 302 y deja pasar al lector y al admin', () => {
  for (const [user, expected] of [
    [author, '/autor'],
    [reader, null],
    [admin, null],
  ] as const) {
    let redirected: [number, string] | null = null;
    let passed = false;
    const res = {
      locals: { user },
      redirect: (status: number, location: string) => {
        redirected = [status, location];
      },
    } as unknown as Response;
    redirectAuthorToStudio({} as Request, res, (() => (passed = true)) as NextFunction);
    assert.deepEqual(redirected, expected ? [302, expected] : null, String(user.id));
    assert.equal(passed, expected === null, String(user.id));
  }
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

test('Seguridad: gestiona una obra solo el autor que la creó; un admin no la gestiona, pero la retira', () => {
  const own = { authorId: author.id };
  const otherAuthor: PermissionSubject = { ...author, id: 20 };
  assert.equal(canManageComic(author, own), true);
  assert.equal(canManageComic(otherAuthor, own), false);
  assert.equal(canManageComic({ ...author, isAuthor: false }, own), false); // el admin le quitó el rol de autor
  assert.equal(canManageComic(admin, own), false);
  assert.equal(canManageComic(author, { authorId: null }), false); // importada

  assert.equal(canWithdrawComic(author, own), true);
  assert.equal(canWithdrawComic(otherAuthor, own), false);
  assert.equal(canWithdrawComic(admin, own), true);
  assert.equal(canWithdrawComic(admin, { authorId: null }), true);
  assert.equal(canWithdrawComic(reader, own), false);
});

test('Seguridad: la vista previa de lo no aprobado es solo del autor dueño y del admin', () => {
  const own = { authorId: author.id };
  assert.equal(canPreviewComic(author, own), true);
  assert.equal(canPreviewComic(admin, own), true);
  assert.equal(canPreviewComic({ ...author, id: 20 }, own), false);
  assert.equal(canPreviewComic(reader, own), false);
  assert.equal(canPreviewComic(null, own), false);
});

test('RN-11: comenta quien puede leer el capítulo sin gastar saldo; el invitado nunca', () => {
  assert.equal(canComment(null, chapter(1), now), false);
  assert.equal(canComment(reader, chapter(1), now), true);
  assert.equal(canComment(reader, chapter(5), now), false); // le costaría saldo: aún no lo ha leído
  assert.equal(canComment(reader, chapter(5, { alreadyRead: true }), now), true);
  assert.equal(canComment({ ...reader, premiumUntil: new Date('2026-12-01T00:00:00Z') }, chapter(5), now), true);
  assert.equal(canComment(admin, chapter(5), now), true);
  assert.equal(canComment(author, chapter(5, { ownsComic: true }), now), true);
});

test('RN-11: cada usuario borra solo sus comentarios', () => {
  assert.equal(canDeleteOwnComment(reader, { userId: reader.id }), true);
  assert.equal(canDeleteOwnComment(reader, { userId: author.id }), false);
  assert.equal(canDeleteOwnComment(admin, { userId: reader.id }), false); // el admin modera en el bloque 4
});
