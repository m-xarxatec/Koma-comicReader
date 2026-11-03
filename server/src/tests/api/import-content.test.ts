import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { pool } from '../../db/pool.js';
import { createLocalStorage } from '../../integrations/storage/local.js';
import { importContent, type ImportSummary } from '../../scripts/import-content.js';
import { IMAGE_KEY_PATTERN } from '../../utils/image.js';
import { deriveKey } from '../../utils/signing.js';

// Importación de content/ (RN-18) contra koma_test, con content/ y almacenamiento en directorios temporales.
// Los archivos de test corren en paralelo sobre la misma BD: cada obra y etiqueta lleva el sufijo RUN.

const RUN = randomBytes(3).toString('hex');
const slugOf = (name: string) => `t${RUN}-${name}`;
const TAG_GENRE = slugOf('genero');
const TAG_THEME = slugOf('tematica');

let workDir = '';
before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'koma-import-'));
});
after(async () => {
  await rm(workDir, { recursive: true, force: true });
  await pool.end();
});

// --- Imágenes mínimas: solo la cabecera que leen la firma y las medidas (utils/image.ts) ---
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const png = (width: number, height: number) =>
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...ascii('IHDR'), ...be32(width), ...be32(height), 8, 6, 0, 0, 0]);
const webp = (width: number, height: number) =>
  Buffer.from([...ascii('RIFF'), 22, 0, 0, 0, ...ascii('WEBPVP8 '), 10, 0, 0, 0, 0x30, 1, 0, 0x9d, 1, 0x2a, width & 0xff, width >> 8, height & 0xff, height >> 8]);
const jpeg = (width: number, height: number) =>
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const gif = Buffer.from([...ascii('GIF89a'), 10, 0, 10, 0, 0, 0, 0]);
const padded = (image: Buffer, size: number) => Buffer.concat([image, Buffer.alloc(size - image.length)]);

// --- content/ de prueba ---
type Files = Record<string, Buffer | string>; // nombre → contenido; '/' en el nombre crea subcarpetas

const comicJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    title: 'Obra de prueba',
    synopsis: 'Sinopsis de prueba.',
    authorCredit: 'Autoría de prueba',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.es',
    isAdult: false,
    contentWarning: null,
    tags: [TAG_GENRE],
    ...overrides,
  });

const TAGS_JSON = JSON.stringify([
  { slug: TAG_GENRE, name: 'Género de prueba', type: 'genre' },
  { slug: TAG_THEME, name: 'Temática de prueba', type: 'theme' },
]);

async function writeFiles(dir: string, files: Files): Promise<void> {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    if (name.endsWith('/')) {
      await mkdir(file, { recursive: true }); // carpeta vacía
      continue;
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}

interface Fixture {
  contentDir: string;
  storageDir: string;
  run: (requestId?: string) => Promise<ImportSummary>;
}

// Un content/ con tags.json y las obras dadas (slug → archivos), y un almacenamiento local vacío.
async function fixture(comics: Record<string, Files>, tagsJson: string | null = TAGS_JSON): Promise<Fixture> {
  const base = await mkdtemp(path.join(workDir, 'caso-'));
  const contentDir = path.join(base, 'content');
  const storageDir = path.join(base, 'storage');
  await mkdir(contentDir);
  if (tagsJson !== null) await writeFile(path.join(contentDir, 'tags.json'), tagsJson);
  for (const [slug, files] of Object.entries(comics)) await writeFiles(path.join(contentDir, slug), files);
  const storage = createLocalStorage({ dir: storageDir, ttlSeconds: 60, signingKey: deriveKey('k'.repeat(48), 'files') });
  return { contentDir, storageDir, run: (requestId = randomUUID()) => importContent({ contentDir, storage, requestId }) };
}

const storedFiles = (dir: string) => readdir(dir).catch(() => [] as string[]);
const comicExists = async (slug: string) => (await pool.query('SELECT 1 FROM comics WHERE slug = $1', [slug])).rowCount === 1;

test('RN-18: importa una obra nueva aprobada, con etiquetas, capítulos, viñetas con sus medidas y una entrada content.import', async () => {
  const slug = slugOf('nueva');
  const { run, storageDir } = await fixture({
    [slug]: {
      'comic.json': comicJson({ contentWarning: 'Aviso de prueba', tags: [TAG_GENRE, TAG_THEME], chapters: { '1': { title: 'Uno' } } }),
      'cover.png': png(300, 400),
      '001/001.png': png(800, 1200),
      '001/002.webp': webp(800, 600),
      '001/010.jpg': jpeg(800, 100), // orden numérico: 001, 002, 010
      '2/1.webp': webp(640, 480), // sin título en comic.json → "Capítulo 2"
    },
  });
  const requestId = randomUUID();
  assert.deepEqual(await run(requestId), { comicsCreated: 1, chaptersAdded: 2, chaptersSkipped: 0, errors: [] });

  const { rows: comics } = await pool.query(
    `SELECT id, title, author_id, status, is_adult, license_url, content_warning, cover_key, deleted_at FROM comics WHERE slug = $1`,
    [slug],
  );
  const comic = comics[0];
  assert.ok(comic);
  assert.equal(comic.title, 'Obra de prueba');
  assert.equal(comic.author_id, null); // importada: "Publicado por la plataforma" (RN-07)
  assert.equal(comic.status, 'approved');
  assert.equal(comic.is_adult, false);
  assert.equal(comic.license_url, 'https://creativecommons.org/licenses/by/4.0/deed.es');
  assert.equal(comic.content_warning, 'Aviso de prueba');
  assert.match(comic.cover_key, /^[0-9a-f-]{36}\.png$/);

  const { rows: tags } = await pool.query(
    'SELECT t.slug, t.name, t.type FROM comic_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.comic_id = $1 ORDER BY t.slug',
    [comic.id],
  );
  assert.deepEqual(tags, [
    { slug: TAG_GENRE, name: 'Género de prueba', type: 'genre' },
    { slug: TAG_THEME, name: 'Temática de prueba', type: 'theme' },
  ]);

  const { rows: chapters } = await pool.query(
    `SELECT number, title, status, published_at IS NOT NULL AS published FROM chapters WHERE comic_id = $1 ORDER BY number`,
    [comic.id],
  );
  assert.deepEqual(chapters, [
    { number: 1, title: 'Uno', status: 'approved', published: true },
    { number: 2, title: 'Capítulo 2', status: 'approved', published: true },
  ]);

  const { rows: panels } = await pool.query<{ number: number; position: number; image_key: string; width: number; height: number }>(
    `SELECT c.number, p.position, p.image_key, p.width, p.height FROM panels p JOIN chapters c ON c.id = p.chapter_id
     WHERE c.comic_id = $1 ORDER BY c.number, p.position`,
    [comic.id],
  );
  assert.deepEqual(
    panels.map(({ number, position, width, height, image_key }) => [number, position, width, height, path.extname(image_key)]),
    [
      [1, 1, 800, 1200, '.png'],
      [1, 2, 800, 600, '.webp'],
      [1, 3, 800, 100, '.jpg'],
      [2, 1, 640, 480, '.webp'],
    ],
  );

  // Cada clave de la BD es un archivo del almacenamiento, con nombre UUID.ext (nunca el original).
  const stored = await storedFiles(storageDir);
  assert.deepEqual(stored.sort(), [comic.cover_key, ...panels.map((panel) => panel.image_key)].sort());
  assert.ok(stored.every((key) => IMAGE_KEY_PATTERN.test(key)));

  const { rows: audits } = await pool.query(
    `SELECT action, actor_id, entity_type, entity_id, after, ip FROM audit_log WHERE request_id = $1 AND entity_type = 'comics'`,
    [requestId],
  );
  assert.deepEqual(audits, [
    { action: 'content.import', actor_id: null, entity_type: 'comics', entity_id: String(comic.id), after: { slug, chapters: [1, 2] }, ip: null },
  ]);
});

test('RN-18: repetir la importación no duplica nada; un capítulo nuevo se añade sin tocar los datos de la obra', async () => {
  const slug = slugOf('repetida');
  const { run, contentDir, storageDir } = await fixture({
    [slug]: { 'comic.json': comicJson(), 'cover.webp': webp(300, 400), '001/001.webp': webp(800, 600) },
  });
  assert.equal((await run()).comicsCreated, 1);
  const filesAfterFirst = (await storedFiles(storageDir)).length;

  const noop = randomUUID();
  assert.deepEqual(await run(noop), { comicsCreated: 0, chaptersAdded: 0, chaptersSkipped: 1, errors: [] });
  assert.equal((await storedFiles(storageDir)).length, filesAfterFirst, 'no vuelve a subir imágenes');
  assert.equal((await pool.query('SELECT 1 FROM audit_log WHERE request_id = $1', [noop])).rowCount, 0, 'sin auditoría si no cambia nada');

  // Capítulo nuevo y datos de la obra cambiados en comic.json: solo entra el capítulo.
  await writeFiles(path.join(contentDir, slug), {
    'comic.json': comicJson({ title: 'Título cambiado', tags: [TAG_THEME], chapters: { '2': { title: 'Dos' } } }),
    '002/001.webp': webp(800, 700),
  });
  const added = randomUUID();
  assert.deepEqual(await run(added), { comicsCreated: 0, chaptersAdded: 1, chaptersSkipped: 1, errors: [] });
  assert.equal((await storedFiles(storageDir)).length, filesAfterFirst + 1, 'solo la viñeta nueva');

  const { rows } = await pool.query(
    `SELECT c.id, c.title, array(SELECT t.slug FROM comic_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.comic_id = c.id) AS tags,
            array(SELECT ch.title FROM chapters ch WHERE ch.comic_id = c.id ORDER BY ch.number) AS chapters
     FROM comics c WHERE c.slug = $1`,
    [slug],
  );
  assert.deepEqual(rows[0]?.title, 'Obra de prueba');
  assert.deepEqual(rows[0]?.tags, [TAG_GENRE]);
  assert.deepEqual(rows[0]?.chapters, ['Capítulo 1', 'Dos']);
  const { rows: audits } = await pool.query('SELECT entity_id, after FROM audit_log WHERE request_id = $1', [added]);
  assert.deepEqual(audits, [{ entity_id: String(rows[0]?.id), after: { slug, chapters: [2] } }]);
});

test('RN-18: una obra con errores se omite entera con su motivo, sin subir imágenes, y las demás se importan', async () => {
  const ok = { 'comic.json': comicJson(), '001/001.webp': webp(800, 600) };
  const cases: Record<string, [Files, RegExp]> = {
    Mal_Nombre: [ok, /^Nombre de carpeta no válido/],
    [slugOf('sin-json')]: [{ '001/001.webp': webp(800, 600) }, /^Falta comic\.json$/],
    [slugOf('json-roto')]: [{ 'comic.json': '{ "title": "Sin cerrar",', '001/001.webp': webp(1, 1) }, /^Error al leer comic\.json/],
    [slugOf('campo-raro')]: [{ ...ok, 'comic.json': comicJson({ licenceUrl: null }) }, /^comic\.json no válido: .*licenceUrl/],
    [slugOf('sin-titulo')]: [{ ...ok, 'comic.json': comicJson({ title: '   ' }) }, /^comic\.json no válido: title: No puede estar vacío/],
    [slugOf('etiqueta')]: [{ ...ok, 'comic.json': comicJson({ tags: ['no-existe-en-tags'] }) }, /^Etiqueta que no existe en tags\.json: no-existe-en-tags$/],
    [slugOf('cap-letras')]: [{ ...ok, 'uno/001.webp': webp(1, 1) }, /^Capítulo rechazado \(uno\)/],
    [slugOf('cap-cero')]: [{ ...ok, '000/001.webp': webp(1, 1) }, /número no válido: 000/],
    [slugOf('cap-repetido')]: [{ ...ok, '1/001.webp': webp(1, 1) }, /dos carpetas con el número 1/],
    [slugOf('cap-vacio')]: [{ ...ok, '002/': '' }, /^Capítulo rechazado \(2\): no tiene imágenes$/],
    [slugOf('vineta-nombre')]: [{ ...ok, '001/portada.webp': webp(1, 1) }, /el nombre debe ser solo un número/],
    [slugOf('vineta-repetida')]: [{ ...ok, '001/1.png': png(1, 1) }, /dos viñetas con el número 1/],
    [slugOf('dos-portadas')]: [{ ...ok, 'cover.png': png(1, 1), 'cover.webp': webp(1, 1) }, /^Hay dos portadas/],
    [slugOf('archivo-raro')]: [{ ...ok, 'notas.txt': 'hola' }, /^Archivo no esperado: notas\.txt/],
    [slugOf('parcial')]: [{ ...ok, '002/001.webp': gif }, /^Imagen rechazada \(capítulo 2, 001\.webp\)/], // el cap. 1 era válido
    // Errores que antes solo aparecían en la transacción, con las imágenes ya subidas.
    [slugOf('nul-texto')]: [{ ...ok, 'comic.json': comicJson({ synopsis: 'a\u0000b' }) }, /^comic\.json no válido: synopsis: Contiene un carácter nulo/],
    [slugOf('nul-licencia')]: [{ ...ok, 'comic.json': comicJson({ licenseUrl: 'https://x.test/a\u0000b' }) }, /^comic\.json no válido: licenseUrl: Contiene un carácter nulo/],
    [slugOf('png-enorme')]: [{ ...ok, '002/001.png': png(2 ** 31, 10) }, /^Imagen rechazada \(capítulo 2, 001\.png\): mide 2147483648 × 10 px/],
  };
  const good = slugOf('buena');
  const comics: Record<string, Files> = { [good]: ok };
  for (const [slug, [files]] of Object.entries(cases)) comics[slug] = files;
  const { run, storageDir } = await fixture(comics);

  const summary = await run();
  assert.equal(summary.comicsCreated, 1);
  assert.equal(summary.chaptersAdded, 1);
  const reasons = new Map(summary.errors.map((error) => [error.slug, error.message]));
  assert.equal(reasons.size, Object.keys(cases).length);
  for (const [slug, [, reason]] of Object.entries(cases)) {
    assert.match(reasons.get(slug) ?? '(sin error)', reason, slug);
    assert.equal(await comicExists(slug), false, `${slug} no entra en la BD`);
  }
  assert.equal(await comicExists(good), true);
  assert.equal((await storedFiles(storageDir)).length, 1, 'solo la viñeta de la obra buena');
});

test('RN-10: se rechazan por su contenido las imágenes que no son JPG, PNG ni WebP, las de más de 5 MB y los capítulos de más de 60', async () => {
  const MB5 = 5 * 1024 * 1024;
  const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`001/${String(i + 1).padStart(3, '0')}.png`, png(10, 10)]));
  const json = { 'comic.json': comicJson() };
  const { run } = await fixture({
    [slugOf('gif')]: { ...json, '001/001.png': gif },
    [slugOf('grande')]: { ...json, '001/001.webp': padded(webp(800, 600), MB5 + 1) },
    [slugOf('exacta')]: { ...json, '001/001.webp': padded(webp(800, 600), MB5) },
    [slugOf('61')]: { ...json, ...many(61) },
    [slugOf('60')]: { ...json, ...many(60) },
    [slugOf('portada-falsa')]: { ...json, 'cover.webp': gif, '001/001.webp': webp(1, 1) },
  });
  const summary = await run();
  const reasons = Object.fromEntries(summary.errors.map((error) => [error.slug, error.message]));
  assert.match(reasons[slugOf('gif')] ?? '', /no es un JPG, PNG ni WebP válido/);
  assert.match(reasons[slugOf('grande')] ?? '', /pasa de 5 MB/);
  assert.match(reasons[slugOf('61')] ?? '', /tiene 61 imágenes y el máximo es 60/);
  assert.match(reasons[slugOf('portada-falsa')] ?? '', /^Imagen rechazada \(cover\.webp\)/);
  assert.equal(summary.errors.length, 4);
  assert.equal(summary.comicsCreated, 2, 'entran la de 5 MB justos y la de 60 imágenes');
});

test('RN-17: una obra marcada como +18 no se importa', async () => {
  const slug = slugOf('adulta');
  const { run } = await fixture({ [slug]: { 'comic.json': comicJson({ isAdult: true }), '001/001.webp': webp(1, 1) } });
  const summary = await run();
  assert.deepEqual(summary.errors, [{ slug, message: 'Obra para adultos rechazada (RN-17): isAdult debe ser false' }]);
  assert.equal(await comicExists(slug), false);
});

test('Seguridad: licenseUrl solo admite enlaces http(s), porque la ficha lo pinta como enlace', async () => {
  const comics: Record<string, Files> = {};
  for (const [name, url] of [['js', 'javascript:alert(1)'], ['data', 'data:text/html,hola'], ['relativa', '/licencia']]) {
    comics[slugOf(name)] = { 'comic.json': comicJson({ licenseUrl: url }), '001/001.webp': webp(1, 1) };
  }
  const summary = await (await fixture(comics)).run();
  assert.equal(summary.comicsCreated, 0);
  assert.equal(summary.errors.length, 3);
  for (const error of summary.errors) assert.match(error.message, /^comic\.json no válido: licenseUrl:/);
});

test('Seguridad: la importación no añade capítulos a una obra de un autor ni a una retirada', async () => {
  const authored = slugOf('de-autor');
  const withdrawn = slugOf('retirada');
  const { rows } = await pool.query<{ id: number }>(`SELECT id FROM users WHERE email = 'author@demo.test'`);
  await pool.query(
    `INSERT INTO comics (slug, title, synopsis, author_id, authorship_declared, author_credit, license)
     VALUES ($1, 'De una autora', 'Sinopsis', $2, true, 'Autora', 'CC BY 4.0')`,
    [authored, rows[0]!.id],
  );
  await pool.query(
    `INSERT INTO comics (slug, title, synopsis, author_credit, license, status, deleted_at)
     VALUES ($1, 'Retirada', 'Sinopsis', 'Autoría', 'CC BY 4.0', 'approved', now())`,
    [withdrawn],
  );
  const files = { 'comic.json': comicJson(), '001/001.webp': webp(1, 1) };
  const summary = await (await fixture({ [authored]: files, [withdrawn]: files })).run();

  const reasons = Object.fromEntries(summary.errors.map((error) => [error.slug, error.message]));
  assert.match(reasons[authored] ?? '', /obra de un autor/);
  assert.match(reasons[withdrawn] ?? '', /retirada \(RN-06\)/);
  const { rows: chapters } = await pool.query(
    'SELECT count(*)::int AS n FROM chapters ch JOIN comics c ON c.id = ch.comic_id WHERE c.slug = ANY($1::text[])',
    [[authored, withdrawn]],
  );
  assert.equal(chapters[0]?.n, 0);
});

test('RN-18: las etiquetas creadas o cambiadas desde tags.json quedan en content.import; sin cambios, no hay entrada', async () => {
  const [a, b, c] = [slugOf('etq-a'), slugOf('etq-b'), slugOf('etq-c')];
  const tagAudits = async (requestId: string) =>
    (
      await pool.query(
        `SELECT action, actor_id, entity_id, before, after, ip FROM audit_log WHERE request_id = $1 AND entity_type = 'tags'`,
        [requestId],
      )
    ).rows;
  const { contentDir, run } = await fixture(
    {},
    JSON.stringify([
      { slug: b, name: 'Be', type: 'theme' },
      { slug: a, name: 'A', type: 'genre' },
    ]),
  );

  const first = randomUUID();
  await run(first);
  assert.deepEqual(await tagAudits(first), [
    {
      action: 'content.import',
      actor_id: null,
      entity_id: null,
      before: null,
      after: { created: [{ slug: a, name: 'A', type: 'genre' }, { slug: b, name: 'Be', type: 'theme' }], updated: [] },
      ip: null,
    },
  ]);

  const same = randomUUID();
  await run(same);
  assert.deepEqual(await tagAudits(same), [], 'sin cambios, sin auditoría');

  // a cambia de nombre, b de tipo y c es nueva: before y after llevan solo los campos cambiados.
  await writeFile(
    path.join(contentDir, 'tags.json'),
    JSON.stringify([
      { slug: a, name: 'A bis', type: 'genre' },
      { slug: b, name: 'Be', type: 'genre' },
      { slug: c, name: 'Ce', type: 'theme' },
    ]),
  );
  const changed = randomUUID();
  await run(changed);
  assert.deepEqual(await tagAudits(changed), [
    {
      action: 'content.import',
      actor_id: null,
      entity_id: null,
      before: { updated: [{ slug: a, name: 'A' }, { slug: b, type: 'theme' }] },
      after: { created: [{ slug: c, name: 'Ce', type: 'theme' }], updated: [{ slug: a, name: 'A bis' }, { slug: b, type: 'genre' }] },
      ip: null,
    },
  ]);
  const { rows } = await pool.query('SELECT slug, name, type FROM tags WHERE slug = ANY($1::text[]) ORDER BY slug', [[a, b, c]]);
  assert.deepEqual(rows, [
    { slug: a, name: 'A bis', type: 'genre' },
    { slug: b, name: 'Be', type: 'genre' },
    { slug: c, name: 'Ce', type: 'theme' },
  ]);
});

test('Seguridad: ningún enlace simbólico de content/ se sigue, ni obra, ni comic.json, ni portada, ni capítulo, ni viñeta', async () => {
  // Fuera de content/: lo que un enlace dejaría leer o copiar al almacenamiento.
  const outside = await mkdtemp(path.join(workDir, 'fuera-'));
  const SECRET = `SECRETO-${RUN}`;
  await writeFiles(outside, {
    'secreto.json': `{"title": ${SECRET}`,
    'comic.json': comicJson(),
    'imagen.webp': webp(10, 10),
    'capitulo/001.webp': webp(10, 10),
    [`${slugOf('obra-fuera')}/comic.json`]: comicJson(),
    [`${slugOf('obra-fuera')}/001/001.webp`]: webp(10, 10),
  });
  const ok = { 'comic.json': comicJson(), '001/001.webp': webp(10, 10) };
  const [json, cover, chapter, panel, linked] = ['enl-json', 'enl-portada', 'enl-capitulo', 'enl-vineta', 'obra-fuera'].map(slugOf) as [string, string, string, string, string];
  const { contentDir, storageDir, run } = await fixture({
    [json]: { '001/001.webp': webp(10, 10) },
    [cover]: ok,
    [chapter]: ok,
    [panel]: ok,
  });
  await symlink(path.join(outside, 'secreto.json'), path.join(contentDir, json, 'comic.json'));
  await symlink(path.join(outside, 'imagen.webp'), path.join(contentDir, cover, 'cover.webp'));
  await symlink(path.join(outside, 'capitulo'), path.join(contentDir, chapter, '002'));
  await symlink(path.join(outside, 'imagen.webp'), path.join(contentDir, panel, '001', '002.webp'));
  await symlink(path.join(outside, linked), path.join(contentDir, linked));

  const summary = await run();
  const reasons = Object.fromEntries(summary.errors.map((error) => [error.slug, error.message]));
  assert.equal(reasons[json], 'Enlace simbólico rechazado: comic.json (copia el archivo o la carpeta dentro de content/)');
  assert.match(reasons[cover] ?? '', /^Enlace simbólico rechazado: cover\.webp/);
  assert.match(reasons[chapter] ?? '', /^Enlace simbólico rechazado: 002/);
  assert.match(reasons[panel] ?? '', /^Enlace simbólico rechazado: capítulo 1, 002\.webp/);
  assert.match(reasons[linked] ?? '', /^Enlace simbólico rechazado/, 'una obra enlazada es un error (código de salida 1), no un aviso');
  assert.equal(summary.errors.length, 5);
  assert.equal(summary.comicsCreated, 0);
  assert.deepEqual(await storedFiles(storageDir), []);
  for (const slug of [json, cover, chapter, panel, linked]) assert.equal(await comicExists(slug), false, slug);

  // tags.json enlazado: se cancela todo.
  const tags = await fixture({}, null);
  await symlink(path.join(outside, 'secreto.json'), path.join(tags.contentDir, 'tags.json'));
  await assert.rejects(tags.run(), /^Error: Importación cancelada: Enlace simbólico rechazado: tags\.json/);
});

// JSON.parse cita el texto cerca de un token inesperado ('Unexpected token…, "{"title": SECRETO…" is not valid
// JSON'); solo algunos errores dan línea y columna.
test('Seguridad: un JSON roto nunca muestra un trozo del archivo; da línea y columna cuando JSON.parse las conoce', async () => {
  const SECRET = `SECRETO-${RUN}`;
  const [token, cut] = [slugOf('json-secreto'), slugOf('json-cortado')];
  const summary = await (
    await fixture({
      [token]: { 'comic.json': `{"title": ${SECRET}}`, '001/001.webp': webp(1, 1) },
      [cut]: { 'comic.json': '{"title": "x",', '001/001.webp': webp(1, 1) },
    })
  ).run();
  const reasons = Object.fromEntries(summary.errors.map((error) => [error.slug, error.message]));
  assert.equal(reasons[token], 'Error al leer comic.json: no es un JSON válido');
  assert.match(reasons[cut] ?? '', /^Error al leer comic\.json: no es un JSON válido \(línea 1, columna \d+\)$/);
  await assert.rejects((await fixture({}, `[${SECRET}]`)).run(), (err: Error) => {
    assert.match(err.message, /^Importación cancelada: Error al leer tags\.json: no es un JSON válido/);
    assert.ok(!err.message.includes(SECRET), err.message);
    return true;
  });
});

test('Seguridad: sin un tags.json válido no se importa nada', async () => {
  const slug = slugOf('sin-etiquetas');
  const files = { [slug]: { 'comic.json': comicJson(), '001/001.webp': webp(1, 1) } };
  await assert.rejects((await fixture(files, null)).run(), /^Error: Importación cancelada: Falta tags\.json$/);
  await assert.rejects(
    (await fixture(files, JSON.stringify([{ slug: TAG_GENRE, name: 'X', type: 'genero' }]))).run(),
    /Importación cancelada: tags\.json no válido/,
  );
  await assert.rejects((await fixture(files, '[{"slug": "x",')).run(), /Importación cancelada: Error al leer tags\.json/);
  assert.equal(await comicExists(slug), false);
});
