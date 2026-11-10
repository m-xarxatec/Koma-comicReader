import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAdminStats, chapterReviewProblem, comicReviewProblem, settingsChange } from '../../modules/admin/admin.rules.js';

// Reglas puras de la aprobación (CU-32; RN-05, RN-17; contrato del bloque 4).

const pending = { status: 'pending' as const, isAdult: false, deletedAt: null };
const codeOf = (error: { status: number; code: string } | null) => (error ? `${error.status} ${error.code}` : null);

test('RN-05: solo una obra pending sin retirar se aprueba o se rechaza', () => {
  assert.equal(comicReviewProblem(pending, 'approve'), null);
  assert.equal(comicReviewProblem(pending, 'reject'), null);
  for (const status of ['approved', 'rejected'] as const) {
    assert.equal(codeOf(comicReviewProblem({ ...pending, status }, 'approve')), '409 CONFLICT', status);
    assert.equal(codeOf(comicReviewProblem({ ...pending, status }, 'reject')), '409 CONFLICT', status);
  }
  assert.equal(codeOf(comicReviewProblem({ ...pending, deletedAt: new Date() }, 'approve')), '410 GONE');
});

test('RN-17: una obra marcada +18 no se aprueba en el MVP, pero sí se rechaza', () => {
  const adult = { ...pending, isAdult: true };
  const problem = comicReviewProblem(adult, 'approve');
  assert.equal(codeOf(problem), '409 CONFLICT');
  assert.match(problem!.message, /\+18/);
  assert.equal(comicReviewProblem(adult, 'reject'), null);
});

test('RN-05: un capítulo pending se revisa también con la obra en pending; no con la obra rechazada o retirada (D2)', () => {
  assert.equal(chapterReviewProblem(pending, { status: 'pending' }), null);
  assert.equal(chapterReviewProblem({ ...pending, status: 'approved' }, { status: 'pending' }), null);
  assert.equal(codeOf(chapterReviewProblem({ ...pending, status: 'rejected' }, { status: 'pending' })), '409 CONFLICT');
  assert.equal(codeOf(chapterReviewProblem({ ...pending, deletedAt: new Date() }, { status: 'pending' })), '410 GONE');
  for (const status of ['draft', 'approved', 'rejected'] as const) {
    assert.equal(codeOf(chapterReviewProblem({ ...pending, status: 'approved' }, { status })), '409 CONFLICT', status);
  }
  assert.equal(codeOf(chapterReviewProblem({ ...pending, deletedAt: new Date() }, { status: 'rejected' })), '410 GONE', 'la obra va primero');
});

test('RN-16: settings.update lleva solo las claves que cambian; sin cambios, no hay nada que guardar', () => {
  const seed = { waitMinutes: 1, maxBalance: 5, refill: 2 };
  assert.equal(settingsChange(seed, seed), null);
  assert.deepEqual(settingsChange(seed, { ...seed, maxBalance: 3 }), { before: { maxBalance: 5 }, after: { maxBalance: 3 } });
  assert.deepEqual(settingsChange(seed, { waitMinutes: 60, maxBalance: 5, refill: 1 }), {
    before: { waitMinutes: 1, refill: 2 },
    after: { waitMinutes: 60, refill: 1 },
  });
  // Un parámetro que falta en la BD se guarda y se audita desde null.
  assert.deepEqual(settingsChange({ waitMinutes: 1, maxBalance: 5 }, seed), { before: { refill: null }, after: { refill: 2 } });
});

// --- RN-20: estadísticas globales (contrato del bloque 5) ---

const statsInput = {
  counts: {
    today: '2026-11-10',
    readers: 7,
    authors: 3,
    admins: 2,
    suspended: 1,
    premium: 4,
    activeLong: 5,
    comics: 6,
    chapters: 20,
    commentsShort: 9,
    moderatedShort: 2,
    auditRecent: 31,
  },
  reads: { guests: { total: 100, lastShort: 10, lastLong: 40 }, users: { total: 50, lastShort: 5, lastLong: 20 } },
  topComics: [{ slug: 'a', title: 'Obra A', reads: { total: 90, lastShort: 9, lastLong: 30 } }],
};

test('RN-20: el total de cuentas es la suma de las activas por rol y las suspendidas (cada cuenta, una vez)', () => {
  const { users } = buildAdminStats(statsInput);
  assert.deepEqual(users, { total: 13, readers: 7, authors: 3, admins: 2, suspended: 1, premium: 4, activeLast30: 5 });
  assert.equal(users.readers + users.authors + users.admins + users.suspended, users.total);
});

test('RN-20: las lecturas son invitados + registrados campo a campo, con las ventanas de 7 y 30 días', () => {
  const stats = buildAdminStats(statsInput);
  assert.deepEqual(stats.reads, {
    total: 150,
    last7: 15,
    last30: 60,
    guests: { total: 100, last7: 10, last30: 40 },
    users: { total: 50, last7: 5, last30: 20 },
  });
  assert.deepEqual(stats.topComics, [{ slug: 'a', title: 'Obra A', reads: { total: 90, last7: 9, last30: 30 } }]);
});

test('RN-20: catálogo, comentarios de 7 días, moderados y eventos de 24 h pasan tal cual; sin datos, ceros', () => {
  const stats = buildAdminStats(statsInput);
  assert.equal(stats.today, '2026-11-10');
  assert.deepEqual(stats.catalog, { comics: 6, chapters: 20 });
  assert.deepEqual(stats.comments, { last7: 9, moderatedLast7: 2 });
  assert.equal(stats.auditLast24h, 31);
  const zero = { total: 0, lastShort: 0, lastLong: 0 };
  const empty = buildAdminStats({
    counts: { ...statsInput.counts, readers: 0, authors: 0, admins: 0, suspended: 0, premium: 0, activeLong: 0, comics: 0, chapters: 0, commentsShort: 0, moderatedShort: 0, auditRecent: 0 },
    reads: { guests: zero, users: zero },
    topComics: [],
  });
  assert.equal(empty.users.total, 0);
  assert.deepEqual(empty.reads, { total: 0, last7: 0, last30: 0, guests: { total: 0, last7: 0, last30: 0 }, users: { total: 0, last7: 0, last30: 0 } });
  assert.deepEqual(empty.topComics, []);
});
