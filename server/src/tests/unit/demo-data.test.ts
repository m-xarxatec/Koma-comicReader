import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chapterResponse, commentSlots, comicResponse, comicsResponse, tagsResponse } from '../../scripts/demo-data.js';

// `npm run demo:data` (solo BD local): las respuestas de la API se validan y cada comentario tiene un sitio fijo.

const chapter = { number: 1, title: 'Uno', status: 'draft', rejectionReason: null, panelCount: 0, publishedAt: null };
const comic = {
  slug: 'faro-de-medianoche',
  title: 'Faro de medianoche',
  status: 'pending',
  coverUrl: null,
  rejectionReason: null,
  chapters: [chapter],
};

test('Seguridad: demo:data valida con zod las respuestas de la API que usa y rechaza una forma inesperada', () => {
  assert.deepEqual(tagsResponse.parse({ tags: [{ slug: 'misterio', name: 'Misterio', type: 'genre' }] }), { tags: [{ slug: 'misterio' }] });
  assert.equal(comicsResponse.parse({ comics: [comic] }).comics[0]!.chapters[0]!.panelCount, 0);
  assert.equal(comicResponse.parse({ comic }).comic.slug, 'faro-de-medianoche');
  assert.equal(chapterResponse.parse({ chapter }).chapter.status, 'draft');

  assert.equal(comicsResponse.safeParse(null).success, false); // respuesta sin cuerpo
  assert.equal(comicsResponse.safeParse({ comics: [{ ...comic, slug: undefined }] }).success, false);
  assert.equal(comicResponse.safeParse({ comic: { ...comic, status: 'published' } }).success, false);
  assert.equal(comicResponse.safeParse({ comic: { ...comic, coverUrl: 3 } }).success, false);
  assert.equal(chapterResponse.safeParse({ chapter: { ...chapter, panelCount: '0' } }).success, false);
  assert.equal(tagsResponse.safeParse({ tags: 'misterio' }).success, false);
});

test('RN-19: cada comentario demo tiene un sitio fijo (obra, capítulo, viñeta, lector) que no depende de la BD', () => {
  const slots = commentSlots();
  assert.equal(slots.length, 30);
  assert.deepEqual(commentSlots(), slots, 'mismo resultado en cada ejecución');
  assert.equal(new Set(slots.map((slot) => slot.body)).size, 30, 'un sitio por texto');

  const readersPerChapter = [6, 4, 3];
  for (const slot of slots) {
    // Solo las dos obras aprobadas y sus capítulos 1–3 aprobados: nunca el 4 ("Marea baja" en borrador, "Banquete real"
    // en revisión), aunque se apruebe después y tenga lecturas.
    assert.ok([0, 1].includes(slot.comicIndex), slot.body);
    assert.ok(slot.chapterNumber >= 1 && slot.chapterNumber <= 3, slot.body);
    assert.ok(slot.position >= 1 && slot.position <= 3, slot.body);
    // Solo quien lee ese capítulo en los datos demo.
    assert.ok(slot.reader >= 1 && slot.reader <= readersPerChapter[slot.chapterNumber - 1]!, slot.body);
  }

  // Los mismos sitios que la primera versión del script: los comentarios ya creados en una BD local coinciden.
  assert.deepEqual(slots.slice(0, 3), [
    { comicIndex: 0, chapterNumber: 1, reader: 1, position: 1, body: '¡Qué ambiente tiene esta viñeta!' },
    { comicIndex: 0, chapterNumber: 2, reader: 2, position: 2, body: 'No me esperaba este giro.' },
    { comicIndex: 1, chapterNumber: 1, reader: 2, position: 3, body: 'Los colores de esta página son preciosos.' },
  ]);
});
