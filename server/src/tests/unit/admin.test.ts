import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chapterReviewProblem, comicReviewProblem, settingsChange } from '../../modules/admin/admin.rules.js';

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
