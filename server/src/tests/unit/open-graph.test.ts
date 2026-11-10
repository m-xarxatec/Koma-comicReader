import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { OG_DESCRIPTION_MAX } from '../../config/limits.js';
import { paths } from '../../config/paths.js';
import { readImageInfo } from '../../utils/image.js';
import { renderTemplate } from '../../utils/layout.js';
import {
  chapterOpenGraph,
  comicOpenGraph,
  HOME_OG_DESCRIPTION,
  homeOpenGraph,
  OG_IMAGE_PATH,
  ogSynopsis,
} from '../../utils/open-graph.js';

// Open Graph (CU-06; contrato del bloque 5, D8 y D9): funciones puras de utils/open-graph.ts y las plantillas.
const APP_URL = 'https://koma.example';
const OG_PAGES = ['home.html', 'comic.html', 'reader.html'];
const meta = (html: string, property: string) =>
  new RegExp(`<meta (?:property|name)="${property.replaceAll(':', '\\:')}" content="([^"]*)">`).exec(html)?.[1];

test('Seguridad: og:image:width y og:image:height coinciden con las medidas reales de koma-og.png, que es un PNG', async () => {
  const info = readImageInfo(await readFile(path.join(paths.publicDir, OG_IMAGE_PATH)));
  assert.ok(info, 'la imagen OG tiene una firma de imagen válida');
  assert.equal(info.type, 'png');
  for (const page of OG_PAGES) {
    const html = await readFile(path.join(paths.publicDir, 'pages', page), 'utf8');
    assert.equal(meta(html, 'og:image:width'), String(info.width), page);
    assert.equal(meta(html, 'og:image:height'), String(info.height), page);
  }
});

test('Seguridad: solo home, comic y reader llevan meta og:*; las páginas de error, ninguna', async () => {
  for (const dir of ['pages', 'errors']) {
    for (const name of (await readdir(path.join(paths.publicDir, dir))).filter((file) => file.endsWith('.html'))) {
      const html = await readFile(path.join(paths.publicDir, dir, name), 'utf8');
      const expected = dir === 'pages' && OG_PAGES.includes(name);
      assert.equal(html.includes('property="og:'), expected, `${dir}/${name}`);
      assert.equal(html.includes('name="twitter:card"'), expected, `${dir}/${name}`);
      if (expected) assert.ok(html.indexOf('property="og:title"') < html.indexOf('</head>'), `${name}: og:* en <head>`);
    }
  }
});

test('Seguridad: og:url y og:image son absolutas con el origen de APP_URL, sin ? ni #', () => {
  for (const base of [APP_URL, `${APP_URL}/`, `${APP_URL}/?x=1#y`]) {
    assert.deepEqual(homeOpenGraph(base), {
      ogTitle: 'Koma',
      ogDescription: 'Koma: descubre cómics gratuitos, explora historias y comparte tu creatividad.',
      ogUrl: 'https://koma.example/',
      ogImage: 'https://koma.example/icons/koma-og.png',
    }, base);
  }
  assert.deepEqual(comicOpenGraph(APP_URL, { slug: 'la-obra', title: 'La obra', synopsis: 'Una historia.' }), {
    ogTitle: 'La obra',
    ogDescription: 'Una historia.',
    ogUrl: 'https://koma.example/obra/la-obra',
    ogImage: 'https://koma.example/icons/koma-og.png',
  });
  assert.deepEqual(chapterOpenGraph('http://koma.local', { slug: 'la-obra', title: 'La obra' }, 3), {
    ogTitle: 'La obra · Capítulo 3',
    ogDescription: 'Lee el capítulo 3 de La obra en Koma.',
    ogUrl: 'http://koma.local/leer/la-obra/3',
    ogImage: 'http://koma.local/icons/koma-og.png',
  });
});

test('Seguridad: la sinopsis pasa a una línea: cada salto de línea, con sus espacios, es un solo espacio', () => {
  assert.equal(ogSynopsis('Primera línea.\nSegunda.'), 'Primera línea. Segunda.');
  assert.equal(ogSynopsis('Uno.  \n\n  Dos.\r\nTres.'), 'Uno. Dos. Tres.');
  assert.equal(ogSynopsis('\nSolo\n'), 'Solo');
  assert.equal(ogSynopsis('Sin saltos'), 'Sin saltos');
});

test('Seguridad: la sinopsis se corta a 200 puntos de código con «…», sin partir un emoji', () => {
  const exact = 'a'.repeat(OG_DESCRIPTION_MAX);
  assert.equal(ogSynopsis(exact), exact, 'justo 200: sin cortar');
  const long = ogSynopsis('a'.repeat(OG_DESCRIPTION_MAX + 1));
  assert.equal([...long].length, OG_DESCRIPTION_MAX);
  assert.ok(long.endsWith('a…'));
  // 250 emojis (500 unidades UTF-16): el corte cuenta puntos de código, nunca deja medio par suplente.
  const emoji = ogSynopsis('😀'.repeat(250));
  assert.equal([...emoji].length, OG_DESCRIPTION_MAX);
  assert.equal(emoji, `${'😀'.repeat(OG_DESCRIPTION_MAX - 1)}…`);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji), 'sin suplente alto suelto');
  // Un espacio justo antes del corte no queda delante de «…».
  assert.equal(ogSynopsis(`${'a'.repeat(OG_DESCRIPTION_MAX - 2)} bbbb`), `${'a'.repeat(OG_DESCRIPTION_MAX - 2)}…`);
});

test('Seguridad: un título y una sinopsis hostiles salen escapados en los atributos og:*', async () => {
  const hostile = `"><script>alert('x')</script>&amp;`;
  const template = await readFile(path.join(paths.publicDir, 'pages', 'comic.html'), 'utf8');
  const html = renderTemplate(template, {
    requestId: 'id',
    title: hostile,
    ...comicOpenGraph(APP_URL, { slug: 'obra', title: hostile, synopsis: `${hostile}\n${hostile}` }),
  });
  const escaped = '&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;amp;';
  assert.equal(meta(html, 'og:title'), escaped);
  assert.equal(meta(html, 'og:description'), `${escaped} ${escaped}`);
  assert.ok(!html.includes('<script>alert'), 'ningún script inyectado');
});

test('Seguridad: el texto fijo de og:description de la portada es el mismo que su meta description', async () => {
  const html = await readFile(path.join(paths.publicDir, 'pages', 'home.html'), 'utf8');
  assert.equal(meta(html, 'description'), HOME_OG_DESCRIPTION);
});
