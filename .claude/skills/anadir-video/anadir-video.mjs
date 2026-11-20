#!/usr/bin/env node
// Skill «anadir-video»: añade vídeos de YouTube a la lista de Tutoriales (CU-42; D11 del bloque 6).
//
//   node .claude/skills/anadir-video/anadir-video.mjs [--dry-run] <enlace o id> [<enlace o id> …]
//
// De cada enlace saca el id, pide a YouTube el título (oEmbed, que además confirma que el vídeo existe y se puede
// incrustar) y la descripción (el primer párrafo de la del vídeo, sin enlaces, recortada), y añade la entrada al
// final de TUTORIALS en server/src/config/tutorials.ts. También guarda su portada, la miniatura de YouTube en WebP
// de 640 × 360 (client/public/icons/tutorials/<id>.webp, que pinta /tutoriales), con ffmpeg: un vídeo sin portada
// no se añade. Un vídeo que ya está en la lista se omite. Node sin dependencias. A YouTube solo se le envía el id.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const LIST_FILE = path.join(ROOT, 'server', 'src', 'config', 'tutorials.ts');
const COVERS_DIR = path.join(ROOT, 'client', 'public', 'icons', 'tutorials');
const COVER_WIDTH = 640;
const COVER_HEIGHT = 360;
const ID = /^[A-Za-z0-9_-]{11}$/; // el mismo patrón que YOUTUBE_ID_PATTERN
const DESCRIPTION_MAX = 200; // puntos de código, «…» incluido
const TIMEOUT_MS = 20_000;
const LIST_START = 'export const TUTORIALS: readonly Tutorial[] = [';

// Id de un enlace de YouTube (watch?v=, youtu.be/, shorts/, embed/, live/) o el id tal cual. null si no lo es.
export function videoId(input) {
  const text = input.trim();
  if (ID.test(text)) return text;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = url.pathname.split('/');
    id = first === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(first) ? second : null;
  }
  return id && ID.test(id) ? id : null;
}

// Primer párrafo de la descripción del vídeo, en una línea, sin enlaces y con DESCRIPTION_MAX caracteres como mucho.
export function shortDescription(raw) {
  const paragraph = raw.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/)[0] ?? '';
  const line = paragraph.replace(/https?:\/\/\S+/g, '').replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim();
  const points = [...line];
  if (points.length <= DESCRIPTION_MAX) return line;
  const cut = points.slice(0, DESCRIPTION_MAX - 1).join('');
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > DESCRIPTION_MAX / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

// Entidades HTML de la meta description (respaldo de la descripción): numéricas (decimales y hexadecimales) y las
// cinco con nombre. &amp; va la última para no decodificar dos veces («&amp;#39;» queda «&#39;»).
export const decodeEntities = (text) =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

async function get(url) {
  const res = await fetch(url, { headers: { 'Accept-Language': 'es,en;q=0.8' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, text: await res.text() };
}

// Título, canal y descripción de un vídeo. Lanza un error con el motivo si YouTube no lo da.
async function fetchVideo(id) {
  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  const oembed = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`);
  if (oembed.status === 401 || oembed.status === 403) throw new Error('el vídeo es privado o no permite incrustarse');
  if (oembed.status !== 200) throw new Error(`YouTube no lo encuentra (oEmbed respondió ${oembed.status})`);
  const { title, author_name: author } = JSON.parse(oembed.text);
  if (typeof title !== 'string' || title.trim() === '') throw new Error('YouTube no devolvió el título');

  let description = '';
  const page = await get(watchUrl);
  if (page.status === 200) {
    const full = page.text.match(/"shortDescription":("(?:[^"\\]|\\.)*")/);
    const meta = page.text.match(/<meta name="description" content="([^"]*)"/);
    if (full) description = shortDescription(JSON.parse(full[1]));
    else if (meta) description = shortDescription(decodeEntities(meta[1]).replace(/\.\.\.$/, '…'));
  }
  if (description === '') description = typeof author === 'string' && author ? `Vídeo de ${author}.` : 'Tutorial en vídeo.';
  return { id, title: title.replace(/\s+/g, ' ').trim(), description, author: typeof author === 'string' ? author : '' };
}

// Portada de un vídeo: dónde se guarda, de dónde se baja (la primera miniatura que exista, de mayor a menor) y cómo
// se convierte (recorte centrado a 16:9, que quita las bandas negras de sddefault y hqdefault, y WebP).
export const coverFile = (id) => path.join(COVERS_DIR, `${id}.webp`);
export const thumbnailUrls = (id) =>
  ['maxresdefault', 'sddefault', 'hqdefault'].map((name) => `https://i.ytimg.com/vi/${id}/${name}.jpg`);
export const coverFfmpegArgs = (input, output) => [
  '-y', '-loglevel', 'error', '-i', input,
  '-vf', `scale=${COVER_WIDTH}:${COVER_HEIGHT}:force_original_aspect_ratio=increase,crop=${COVER_WIDTH}:${COVER_HEIGHT}`,
  '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', output,
];

// Baja la miniatura y escribe la portada. Lanza un error con el motivo si no puede.
async function saveCover(id) {
  let image = null;
  for (const url of thumbnailUrls(id)) {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) {
      image = Buffer.from(await res.arrayBuffer());
      break;
    }
  }
  if (!image) throw new Error('YouTube no da ninguna miniatura para la portada');
  const work = mkdtempSync(path.join(tmpdir(), 'koma-portada-'));
  try {
    const input = path.join(work, `${id}.jpg`);
    writeFileSync(input, image);
    const run = spawnSync('ffmpeg', coverFfmpegArgs(input, coverFile(id)), { encoding: 'utf8' });
    if (run.error) throw new Error('hace falta ffmpeg para la portada (no está instalado)');
    if (run.status !== 0) throw new Error(`ffmpeg no pudo crear la portada: ${run.stderr.trim()}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Literal de TypeScript con comillas simples.
const literal = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const entry = (video) =>
  `  {\n    id: ${literal(video.id)},\n    title: ${literal(video.title)},\n    description: ${literal(video.description)},\n  },\n`;

// Inserta las entradas al final de la lista. Devuelve el archivo nuevo. El cierre es «];» justo tras la apertura
// (lista vacía) o al principio de una línea: un «];» dentro del texto de una entrada va siempre sangrado.
export function insertEntries(source, videos) {
  const start = source.indexOf(LIST_START);
  const rest = start === -1 ? '' : source.slice(start + LIST_START.length);
  const offset = start === -1 ? -1 : rest.startsWith('];') ? 0 : rest.search(/^\];/m);
  const end = offset === -1 ? -1 : start + LIST_START.length + offset;
  if (start === -1 || end === -1) throw new Error(`No encuentro la lista TUTORIALS en ${path.relative(ROOT, LIST_FILE)}`);
  const body = source.slice(start + LIST_START.length, end).trim();
  const kept = body === '' ? '' : `${body.replace(/,?\s*$/, ',')}\n`.replace(/^(?! {2})/, '  ');
  return `${source.slice(0, start)}${LIST_START}\n${kept}${videos.map(entry).join('')}${source.slice(end)}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const inputs = args.filter((arg) => arg !== '--dry-run');
  if (inputs.length === 0) {
    console.error('Uso: node .claude/skills/anadir-video/anadir-video.mjs [--dry-run] <enlace o id> [<enlace o id> …]');
    process.exit(2);
  }

  let source = readFileSync(LIST_FILE, 'utf8');
  const added = [];
  let failed = false;
  for (const input of inputs) {
    const id = videoId(input);
    if (!id) {
      console.error(`✖ ${input}: no es un enlace ni un id de YouTube`);
      failed = true;
      continue;
    }
    if (source.includes(`id: '${id}'`) || added.some((video) => video.id === id)) {
      console.log(`· ${id}: ya está en la lista; se omite`);
      continue;
    }
    try {
      const video = await fetchVideo(id);
      if (!dryRun) await saveCover(id);
      added.push(video);
      const cover = dryRun ? '(--dry-run: no se guarda)' : path.relative(ROOT, coverFile(id));
      console.log(`✔ ${id}\n    título:      ${video.title}\n    descripción: ${video.description}\n    canal:       ${video.author}\n    portada:     ${cover}`);
    } catch (err) {
      console.error(`✖ ${id}: ${err instanceof Error ? err.message : String(err)}`);
      failed = true;
    }
  }

  if (added.length > 0 && !dryRun) {
    source = insertEntries(source, added);
    writeFileSync(LIST_FILE, source);
    console.log(`\n${added.length} vídeo(s) añadido(s) a ${path.relative(ROOT, LIST_FILE)}. Ahora: npm test`);
  } else if (added.length > 0) {
    console.log(`\n--dry-run: no se ha escrito nada (${added.length} vídeo(s) listos).`);
  }
  process.exit(failed ? 1 : 0);
}

if (import.meta.main) await main();
