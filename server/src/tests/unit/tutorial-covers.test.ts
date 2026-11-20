import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';
import { TUTORIALS } from '../../config/tutorials.js';
import { readImageInfo } from '../../utils/image.js';

// Portadas de /tutoriales (CU-42; pulido, 20-nov): tutorials.ts pinta /icons/tutorials/<id>.webp en cada tarjeta.
// Un vídeo sin portada da un 404 en la consola del navegador; /anadir-video la genera al añadir el vídeo.

const COVERS_DIR = path.join(paths.publicDir, 'icons', 'tutorials');
const COVER_WIDTH = 640;
const COVER_HEIGHT = 360;

interface AddVideoCovers {
  coverFile: (id: string) => string;
  thumbnailUrls: (id: string) => string[];
  coverFfmpegArgs: (input: string, output: string) => string[];
}
const load = () =>
  import(pathToFileURL(path.join(paths.root, '.claude', 'skills', 'anadir-video', 'anadir-video.mjs')).href) as Promise<AddVideoCovers>;

test('Seguridad: (CU-42) cada vídeo de la lista tiene su portada WebP de 640 × 360 en icons/tutorials', () => {
  for (const { id } of TUTORIALS) {
    const file = path.join(COVERS_DIR, `${id}.webp`);
    let info: ReturnType<typeof readImageInfo>;
    try {
      info = readImageInfo(readFileSync(file));
    } catch {
      assert.fail(`Falta la portada de «${id}»: ${path.relative(paths.root, file)} (la genera /anadir-video)`);
    }
    assert.deepEqual(info, { type: 'webp', width: COVER_WIDTH, height: COVER_HEIGHT }, id);
  }
});

test('Seguridad: (CU-42) en icons/tutorials no hay portadas de vídeos que ya no están en la lista', () => {
  const ids = new Set(TUTORIALS.map((tutorial) => tutorial.id));
  for (const name of readdirSync(COVERS_DIR)) {
    assert.match(name, /^[A-Za-z0-9_-]{11}\.webp$/, name);
    assert.ok(ids.has(name.slice(0, -'.webp'.length)), `${name} no corresponde a ningún vídeo de TUTORIALS`);
  }
});

test('Seguridad: (CU-42) /anadir-video guarda la portada en icons/tutorials/<id>.webp y la pide a i.ytimg.com, de mayor a menor', async () => {
  const { coverFile, thumbnailUrls } = await load();
  assert.equal(coverFile('XeIR7P82aPU'), path.join(COVERS_DIR, 'XeIR7P82aPU.webp'));
  assert.deepEqual(thumbnailUrls('XeIR7P82aPU'), [
    'https://i.ytimg.com/vi/XeIR7P82aPU/maxresdefault.jpg',
    'https://i.ytimg.com/vi/XeIR7P82aPU/sddefault.jpg',
    'https://i.ytimg.com/vi/XeIR7P82aPU/hqdefault.jpg',
  ]);
});

test('Seguridad: (CU-42) /anadir-video recorta la miniatura a 16:9 y la deja en WebP de 640 × 360 con ffmpeg', async () => {
  const { coverFfmpegArgs } = await load();
  const args = coverFfmpegArgs('/tmp/in.jpg', '/tmp/out.webp');
  assert.deepEqual(args.slice(0, 4), ['-y', '-loglevel', 'error', '-i']);
  assert.equal(args[4], '/tmp/in.jpg');
  assert.equal(args.at(-1), '/tmp/out.webp');
  const filter = args[args.indexOf('-vf') + 1];
  assert.equal(filter, `scale=${COVER_WIDTH}:${COVER_HEIGHT}:force_original_aspect_ratio=increase,crop=${COVER_WIDTH}:${COVER_HEIGHT}`);
  assert.equal(args[args.indexOf('-c:v') + 1], 'libwebp');
});
