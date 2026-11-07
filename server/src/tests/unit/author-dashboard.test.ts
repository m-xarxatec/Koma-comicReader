import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupWorkReads, type Reads } from '../../modules/comics/comics.rules.js';

// RN-19: la obra suma sus capítulos approved vivos y el total suma las obras (las ventanas las calcula el SQL).

const reads = (total: number, last7: number, last30: number): Reads => ({ total, last7, last30 });
const comic = (id: number) => ({ id, slug: `obra-${id}` });

test('RN-19: la obra suma sus capítulos y el total suma las obras', () => {
  const { reads: total, works } = groupWorkReads([
    { comic: comic(2), chapter: { number: 1, title: 'Capítulo 1', reads: reads(40, 5, 20) } },
    { comic: comic(2), chapter: { number: 2, title: 'Capítulo 2', reads: reads(10, 3, 10) } },
    { comic: comic(1), chapter: { number: 1, title: 'Capítulo 1', reads: reads(7, 0, 7) } },
  ]);
  assert.deepEqual(
    works.map((work) => [work.comic.id, work.reads]),
    [
      [2, reads(50, 8, 30)],
      [1, reads(7, 0, 7)],
    ],
  );
  assert.deepEqual(total, reads(57, 8, 37));
  assert.deepEqual(
    works[0]!.chapters.map((chapter) => chapter.number),
    [1, 2],
    'los capítulos en el orden en que llegan',
  );
});

test('RN-19: una obra sin capítulos aprobados queda con ceros y sin capítulos; sin obras, todo a cero', () => {
  const { reads: total, works } = groupWorkReads([
    { comic: comic(3), chapter: null },
    { comic: comic(4), chapter: { number: 1, title: 'Capítulo 1', reads: reads(0, 0, 0) } },
  ]);
  assert.deepEqual(works[0], { comic: comic(3), reads: reads(0, 0, 0), chapters: [] });
  assert.deepEqual(works[1]!.reads, reads(0, 0, 0));
  assert.deepEqual(total, reads(0, 0, 0));
  assert.deepEqual(groupWorkReads([]), { reads: reads(0, 0, 0), works: [] });
});
