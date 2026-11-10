import assert from 'node:assert/strict';
import { test } from 'node:test';
import { abandonmentOf } from '../../modules/comics/comics.rules.js';
import { progressProblem } from '../../modules/reading/reading.rules.js';
import { demoLastPanel } from '../../scripts/demo-data.js';

// RN-21: punto de abandono (contrato del bloque 5). El SQL agrupa por viñeta máxima (sin NULL, sin el admin ni el
// autor dueño); estas funciones puras hacen el resto.

test('RN-21: sin lectores con progreso, ceros y sin viñeta de abandono', () => {
  assert.deepEqual(abandonmentOf(8, []), { panels: 8, readersWithData: 0, reachedEnd: 0, reachedEndPct: 0, dropPanel: null, dropReaders: 0 });
});

test('RN-21: llegan al final los que alcanzan la última viñeta, en número y en porcentaje redondeado', () => {
  const result = abandonmentOf(4, [
    { lastPanel: 2, readers: 2 },
    { lastPanel: 3, readers: 1 },
    { lastPanel: 4, readers: 3 },
  ]);
  assert.deepEqual(result, { panels: 4, readersWithData: 6, reachedEnd: 3, reachedEndPct: 50, dropPanel: 2, dropReaders: 2 });
  assert.equal(abandonmentOf(3, [{ lastPanel: 3, readers: 2 }, { lastPanel: 1, readers: 1 }]).reachedEndPct, 67); // 66,67 → 67
});

test('RN-21: la viñeta donde más se abandona es la moda entre quienes no llegan al final; empate, la menor', () => {
  const tie = abandonmentOf(10, [
    { lastPanel: 7, readers: 2 },
    { lastPanel: 3, readers: 2 },
    { lastPanel: 10, readers: 9 }, // los que llegan al final no cuentan para la moda
  ]);
  assert.deepEqual({ dropPanel: tie.dropPanel, dropReaders: tie.dropReaders }, { dropPanel: 3, dropReaders: 2 });
  const allEnd = abandonmentOf(5, [{ lastPanel: 5, readers: 4 }]);
  assert.deepEqual({ reachedEndPct: allEnd.reachedEndPct, dropPanel: allEnd.dropPanel, dropReaders: allEnd.dropReaders }, { reachedEndPct: 100, dropPanel: null, dropReaders: 0 });
});

test('RN-21: una viñeta máxima mayor que las viñetas actuales cuenta como final (nunca más del 100 %)', () => {
  const result = abandonmentOf(3, [{ lastPanel: 5, readers: 1 }, { lastPanel: 3, readers: 1 }]);
  assert.deepEqual({ reachedEnd: result.reachedEnd, reachedEndPct: result.reachedEndPct }, { reachedEnd: 2, reachedEndPct: 100 });
});

test('RN-21: el progreso solo admite viñetas del capítulo (1…viñetas)', () => {
  assert.equal(progressProblem(1, 4), null);
  assert.equal(progressProblem(4, 4), null);
  assert.equal(progressProblem(5, 4), 'La viñeta no existe en este capítulo');
  assert.equal(progressProblem(0, 4), 'La viñeta no existe en este capítulo');
  assert.equal(progressProblem(1, 0), 'La viñeta no existe en este capítulo');
});

test('RN-21: demo:data pone una viñeta máxima determinista, entre 1 y las viñetas del capítulo', () => {
  for (let reader = 0; reader < 6; reader++) {
    for (let chapter = 1; chapter <= 3; chapter++) {
      for (let comic = 0; comic < 3; comic++) {
        for (const panels of [1, 2, 6]) {
          const value = demoLastPanel(reader, chapter, comic, panels);
          assert.ok(value >= 1 && value <= panels, `${reader}/${chapter}/${comic}/${panels}: ${value}`);
          assert.equal(demoLastPanel(reader, chapter, comic, panels), value, 'siempre el mismo valor');
        }
      }
    }
  }
  // Con 6 viñetas, unos llegan al final y otros no: el panel del autor tiene algo que enseñar.
  const values = Array.from({ length: 6 }, (_, reader) => demoLastPanel(reader, 1, 0, 6));
  assert.ok(values.includes(6) && values.some((value) => value < 6), values.join(','));
});
