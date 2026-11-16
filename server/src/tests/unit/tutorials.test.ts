import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { TUTORIALS, VIDEO_FILE_PATTERN, YOUTUBE_ID_PATTERN, type Tutorial } from '../../config/tutorials.js';
import { listTutorials, tutorialsProblem } from '../../utils/tutorials.js';

// Tutoriales (CU-42; contrato del bloque 6, D11–D13): la lista versionada, el respaldo local y TUTORIAL_VIDEOS_DIR.

const videosDir = mkdtempSync(path.join(tmpdir(), 'koma-tutorials-unit-'));
after(() => rmSync(videosDir, { recursive: true, force: true }));

const tutorial = (id: string, overrides: Partial<Tutorial> = {}): Tutorial => ({ id, title: `Vídeo ${id}`, description: 'Una descripción', ...overrides });

test('Seguridad: (CU-42) cada tutorial de la lista versionada tiene un id de YouTube válido y único, título y descripción', () => {
  assert.equal(tutorialsProblem(TUTORIALS), null);
});

test('Seguridad: (CU-42) la comprobación de la lista rechaza un id que no es de YouTube, uno repetido y un título o una descripción vacíos', () => {
  assert.equal(tutorialsProblem([]), null);
  assert.equal(tutorialsProblem([tutorial('dQw4w9WgXcQ'), tutorial('abc_DEF-123')]), null);
  for (const id of ['corto', 'dQw4w9WgXcQ1', 'dQw4w9WgXc?', '../../../etc', 'https://youtu.be/dQw4w9WgXcQ', '']) {
    assert.match(tutorialsProblem([tutorial(id)]) ?? '', /id/, id);
  }
  assert.match(tutorialsProblem([tutorial('dQw4w9WgXcQ'), tutorial('dQw4w9WgXcQ')]) ?? '', /repetido/);
  assert.match(tutorialsProblem([tutorial('dQw4w9WgXcQ', { title: '  ' })]) ?? '', /título/);
  assert.match(tutorialsProblem([tutorial('dQw4w9WgXcQ', { description: '' })]) ?? '', /descripción/);
});

test('Seguridad: (CU-42) el nombre de un vídeo local es exactamente <id>.mp4', () => {
  assert.ok(YOUTUBE_ID_PATTERN.test('dQw4w9WgXcQ'));
  assert.ok(VIDEO_FILE_PATTERN.test('dQw4w9WgXcQ.mp4'));
  for (const file of ['dQw4w9WgXcQ', 'dQw4w9WgXcQ.MP4', 'dQw4w9WgXcQ.mp4.exe', '../dQw4w9Wg.mp4', 'dQw4w9WgXc/.mp4', '.mp4', 'dQw4w9WgXcQ.webm']) {
    assert.ok(!VIDEO_FILE_PATTERN.test(file), file);
  }
});

test('Seguridad: (CU-42) local es true solo si existe <id>.mp4 en TUTORIAL_VIDEOS_DIR; sin carpeta, siempre false', async () => {
  writeFileSync(path.join(videosDir, 'dQw4w9WgXcQ.mp4'), 'vídeo');
  const list = [tutorial('dQw4w9WgXcQ'), tutorial('abc_DEF-123')];
  assert.deepEqual(await listTutorials(list, videosDir), [
    { id: 'dQw4w9WgXcQ', title: 'Vídeo dQw4w9WgXcQ', description: 'Una descripción', local: true },
    { id: 'abc_DEF-123', title: 'Vídeo abc_DEF-123', description: 'Una descripción', local: false },
  ]);
  assert.deepEqual((await listTutorials(list, null)).map((item) => item.local), [false, false]);
  assert.deepEqual((await listTutorials(list, path.join(videosDir, 'no-existe'))).map((item) => item.local), [false, false]);
});

// env.ts termina el proceso si una variable no es válida: se carga en un proceso aparte con un entorno mínimo completo.
const ENV_MODULE = pathToFileURL(path.join(import.meta.dirname, '..', '..', 'config', 'env.js')).href;
const BASE_ENV = {
  NODE_ENV: 'development',
  PORT: '3000',
  HOST: '127.0.0.1',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://koma:koma@localhost:5432/koma',
  JWT_SECRET: 'j'.repeat(32),
  COOKIE_SECRET: 'c'.repeat(32),
  COOKIE_SECURE: 'false',
  TRUST_PROXY: '0',
  AD_MIN_SECONDS: '5',
  SIGNED_URL_TTL_SECONDS: '7200',
  LOG_LEVEL: 'error',
  CONTENT_DIR: './content',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: './storage',
  PAYMENTS_DRIVER: 'fake',
};

function loadVideosDir(overrides: Record<string, string>) {
  const env: Record<string, string> = { ...BASE_ENV, PATH: process.env['PATH'] ?? '', ...overrides };
  const script = `const { env } = await import(${JSON.stringify(ENV_MODULE)}); console.log(JSON.stringify(env.TUTORIAL_VIDEOS_DIR ?? null));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
}

test('Seguridad: TUTORIAL_VIDEOS_DIR es opcional y solo vale en local: con APP_URL en https, la app no arranca', () => {
  assert.deepEqual([loadVideosDir({}).status, loadVideosDir({}).stdout], [0, 'null']);
  assert.equal(loadVideosDir({ TUTORIAL_VIDEOS_DIR: '' }).stdout, 'null');
  const local = loadVideosDir({ TUTORIAL_VIDEOS_DIR: './videos' });
  assert.equal(local.status, 0, local.stderr);
  assert.equal(local.stdout, '"./videos"');
  const online = loadVideosDir({ TUTORIAL_VIDEOS_DIR: './videos', APP_URL: 'https://koma.example' });
  assert.equal(online.status, 1);
  assert.match(online.stderr, /TUTORIAL_VIDEOS_DIR/);
  // Sin la variable, https arranca igual.
  assert.equal(loadVideosDir({ APP_URL: 'https://koma.example' }).status, 0);
});
