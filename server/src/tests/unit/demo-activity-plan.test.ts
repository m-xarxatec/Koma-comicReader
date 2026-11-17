import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMMENT_BODY_MAX } from '../../config/limits.js';
import { registerBody } from '../../modules/auth/auth.schema.js';
import { commentBody } from '../../modules/comments/comments.schema.js';
import { isDemoEmail } from '../../scripts/demo-activity-guard.js';
import {
  ACTIVITY_ACCOUNTS,
  COMMENT_MIN_GAP_MS,
  COMMENT_TEXTS,
  GUESTS_PER_PASS,
  MAX_REGISTRATIONS_PER_PASS,
  commentFor,
  guestChapters,
  maxPanel,
  pauseMs,
  pickComics,
  readingMs,
  retryDelayMs,
} from '../../scripts/demo-activity-plan.js';

// Plan de una pasada de la actividad simulada (idea 24; «Pulido», D14–D21): funciones puras y deterministas. El script
// (demo-activity.ts) solo las ejecuta contra la API.

const SLUGS = ['alfa', 'beta', 'gamma', 'delta', 'epsilon'];

test('Seguridad: (D14–D17) seis cuentas actividad1…6@demo.test con nombres que el registro acepta', () => {
  assert.equal(ACTIVITY_ACCOUNTS.length, 6);
  assert.deepEqual(ACTIVITY_ACCOUNTS.map((account) => account.email), [1, 2, 3, 4, 5, 6].map((n) => `actividad${n}@demo.test`));
  assert.deepEqual(ACTIVITY_ACCOUNTS.map((account) => account.displayName), ['Lucía_lee', 'MarcoV', 'Nerea Sol', 'DaniTinta', 'Sara R.', 'Leo Campos']);
  for (const account of ACTIVITY_ACCOUNTS) {
    assert.equal(isDemoEmail(account.email), true, account.email);
    assert.equal(registerBody.safeParse({ ...account, password: 'contraseña-demo-1' }).success, true, account.displayName);
  }
});

test('RN-13: como mucho 3 altas por pasada, 3 invitados y 15 s entre comentarios de una cuenta', () => {
  assert.equal(MAX_REGISTRATIONS_PER_PASS, 3);
  assert.equal(GUESTS_PER_PASS, 3);
  assert.ok(COMMENT_MIN_GAP_MS >= 15_000);
});

test('RN-11: los textos de los comentarios son variados, únicos y válidos para la API', () => {
  assert.ok(COMMENT_TEXTS.length >= 20);
  assert.equal(new Set(COMMENT_TEXTS).size, COMMENT_TEXTS.length);
  for (const body of COMMENT_TEXTS) {
    assert.equal(commentBody.safeParse({ body }).success, true, body);
    assert.ok([...body].length <= COMMENT_BODY_MAX, body);
  }
});

test('RN-21: maxPanel es determinista, cae dentro del capítulo y unos 6 de cada 10 llegan al final', () => {
  let reachedEnd = 0;
  let total = 0;
  for (let account = 0; account < 6; account++) {
    for (const slug of SLUGS) {
      for (let chapter = 1; chapter <= 20; chapter++) {
        const panels = 5 + ((chapter * 7) % 30);
        const panel = maxPanel(account, slug, chapter, panels);
        assert.ok(Number.isInteger(panel) && panel >= 1 && panel <= panels, `${account} ${slug} ${chapter}: ${panel} de ${panels}`);
        assert.equal(maxPanel(account, slug, chapter, panels), panel, 'la misma entrada da la misma viñeta');
        if (panel === panels) reachedEnd += 1;
        total += 1;
      }
    }
  }
  const share = reachedEnd / total;
  assert.ok(share > 0.5 && share < 0.7, `llegan al final ${(share * 100).toFixed(1)} %`);
  assert.equal(maxPanel(0, 'alfa', 1, 1), 1, 'un capítulo de una viñeta siempre se termina');
});

test('RN-11: commentFor comenta solo algunos capítulos, en una viñeta ya vista y con un texto de la lista', () => {
  let commented = 0;
  let total = 0;
  const bodies = new Set<string>();
  for (let account = 0; account < 6; account++) {
    for (const slug of SLUGS) {
      for (let chapter = 1; chapter <= 20; chapter++) {
        const reached = maxPanel(account, slug, chapter, 24);
        const comment = commentFor(account, slug, chapter, reached);
        assert.deepEqual(commentFor(account, slug, chapter, reached), comment, 'determinista');
        total += 1;
        if (!comment) continue;
        commented += 1;
        bodies.add(comment.body);
        assert.ok(comment.position >= 1 && comment.position <= reached, `viñeta ${comment.position} de ${reached} vistas`);
        assert.ok(COMMENT_TEXTS.includes(comment.body));
      }
    }
  }
  const share = commented / total;
  assert.ok(share > 0.2 && share < 0.45, `comenta el ${(share * 100).toFixed(1)} % de los capítulos`);
  assert.ok(bodies.size >= 15, `textos distintos usados: ${bodies.size}`);
});

test('Seguridad: (D19) pickComics elige obras del catálogo sin repetir, distintas según la cuenta y el día', () => {
  for (let account = 0; account < 6; account++) {
    const picked = pickComics(account, 20_000, SLUGS, 2);
    assert.equal(picked.length, 2);
    assert.equal(new Set(picked).size, 2);
    for (const slug of picked) assert.ok(SLUGS.includes(slug));
    assert.deepEqual(pickComics(account, 20_000, SLUGS, 2), picked, 'determinista');
  }
  const firstChoices = new Set([0, 1, 2, 3, 4, 5].map((account) => pickComics(account, 20_000, SLUGS, 2)[0]));
  assert.ok(firstChoices.size >= 3, 'las cuentas no empiezan todas por la misma obra');
  assert.notDeepEqual(pickComics(0, 20_000, SLUGS, 2), pickComics(0, 20_001, SLUGS, 2), 'otro día, otras obras');
  assert.deepEqual(pickComics(0, 20_000, ['sola'], 2), ['sola'], 'con una sola obra no se repite');
  assert.deepEqual(pickComics(0, 20_000, [], 2), []);
});

test('RN-01: (D18) un invitado lee los caps. 1 y 2 y, si existe, el 3; nunca el 4', () => {
  assert.deepEqual(guestChapters([1, 2, 3, 4, 5]), [1, 2, 3]);
  assert.deepEqual(guestChapters([1, 2]), [1, 2]);
  assert.deepEqual(guestChapters([1]), [1]);
  assert.deepEqual(guestChapters([2, 3, 4]), [2, 3], 'sin cap. 1 (retirado), solo los que hay hasta el 3');
  assert.deepEqual(guestChapters([]), []);
  assert.ok(GUESTS_PER_PASS * guestChapters([1, 2, 3, 4]).length <= 9, 'como mucho 9 lecturas de invitado por pasada');
});

test('Seguridad: (D20) las pausas son de persona: segundos entre acciones y más al leer; deterministas y escaladas por la velocidad', () => {
  for (const seed of ['a', 'b', 'c', 'actividad3@demo.test:alfa:2']) {
    const think = pauseMs('think', seed, 1);
    const browse = pauseMs('browse', seed, 1);
    assert.ok(think >= 3_000 && think <= 9_000, `think ${think}`);
    assert.ok(browse >= 6_000 && browse <= 20_000, `browse ${browse}`);
    assert.equal(pauseMs('think', seed, 1), think, 'determinista');
    assert.ok(pauseMs('think', seed, 0.01) <= 90, 'en modo rápido, casi nada');
  }
  assert.notEqual(pauseMs('think', 'a', 1), pauseMs('think', 'b', 1), 'no todas las pausas duran lo mismo');
  // Leer: unos segundos por viñeta, con tope para que una pasada no se alargue.
  assert.ok(readingMs(1, 'a', 1) >= 2_000);
  assert.ok(readingMs(10, 'a', 1) > readingMs(2, 'a', 1));
  assert.ok(readingMs(60, 'a', 1) <= 90_000, 'tope por capítulo');
  assert.ok(readingMs(60, 'a', 0.01) <= 900);
});

test('RN-13: retryDelayMs espera hasta retryAt con un margen y nunca más del tope; sin fecha válida, no espera', () => {
  const now = Date.parse('2026-11-18T10:00:00.000Z');
  assert.equal(retryDelayMs('2026-11-18T10:00:20.000Z', now, 120_000), 21_000);
  assert.equal(retryDelayMs('2026-11-18T09:59:00.000Z', now, 120_000), 1_000, 'una fecha pasada: solo el margen');
  assert.equal(retryDelayMs('2026-11-18T11:00:00.000Z', now, 120_000), null, 'más que el tope: se deja para otra pasada');
  assert.equal(retryDelayMs(undefined, now, 120_000), null);
  assert.equal(retryDelayMs('no es una fecha', now, 120_000), null);
});

test('RN-21: dentro de una misma obra, una cuenta no hace lo mismo en todos los capítulos (el número de capítulo cuenta)', () => {
  // Con una mezcla pobre, el último carácter de la semilla (el capítulo) no cambiaba el resultado: todas las lecturas
  // de una cuenta en una obra acababan en la misma viñeta y se comentaban todas o ninguna.
  let variedPanels = 0;
  let variedComments = 0;
  let pairs = 0;
  for (const slug of ['c0af2da-actividad-a', 'el-senor-de-los-anillos-de-cebolla', 'pimienta', 'alfa']) {
    for (let account = 0; account < 6; account++) {
      const chapters = Array.from({ length: 12 }, (_unused, index) => index + 1);
      const panels = new Set(chapters.map((chapter) => maxPanel(account, slug, chapter, 24)));
      const comments = new Set(chapters.map((chapter) => commentFor(account, slug, chapter, 24) !== null));
      pairs += 1;
      if (panels.size > 1) variedPanels += 1;
      if (comments.size > 1) variedComments += 1;
    }
  }
  assert.equal(variedPanels, pairs, 'en 12 capítulos, la viñeta máxima varía');
  assert.ok(variedComments >= pairs - 2, `comenta unos capítulos sí y otros no: ${variedComments} de ${pairs}`);
});
