import { randomUUID } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../config/env.js';
import { MAX_IMAGE_BYTES, MAX_PANELS_PER_CHAPTER } from '../config/limits.js';
import { paths } from '../config/paths.js';
import { databaseTarget, pool, withTransaction } from '../db/pool.js';
import type { StorageDriver } from '../integrations/storage/driver.js';
import * as audit from '../modules/audit/audit.service.js';
import * as chaptersRepository from '../modules/chapters/chapters.repository.js';
import * as comicsRepository from '../modules/comics/comics.repository.js';
import { IMAGE_CONTENT_TYPES, newImageKey, readImageInfo, type ImageType } from '../utils/image.js';
import { logger } from '../utils/logger.js';

// Importación de content/ (RN-18; formato en docs/plan_mvp.md, "Contenido desde directorios").
// - Cada obra se valida entera antes de subir nada; con un error se omite con su motivo y el resto sigue.
// - Una obra se identifica por su carpeta (= slug). Si ya existe, sus datos no se tocan: solo se añaden
//   los capítulos nuevos; uno ya existente (en cualquier estado) se omite.
// - Imágenes: firma, 5 MB y 60 por capítulo (RN-10); ancho y alto de la cabecera; claves UUID.ext.
// - Una transacción por obra, con su entrada content.import (actor NULL = sistema), solo si añade algo.

z.config(z.locales.es());

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CHAPTER_DIR = /^\d+$/;
const PANEL_FILE = /^(\d+)\.(jpg|jpeg|png|webp)$/i;
const COVER_FILE = /^cover\.(jpg|jpeg|png|webp)$/i;
const MAX_INT = 2_147_483_647; // INTEGER de PostgreSQL
const COMIC_FILE = 'comic.json';
const TAGS_FILE = 'tags.json';

const text = z.string().trim().min(1, { error: 'No puede estar vacío' });
const slug = z.string().regex(SLUG, { error: 'Solo minúsculas, números y guiones entre palabras' });

const tagsFileSchema = z
  .array(z.strictObject({ slug, name: text, type: z.enum(['genre', 'theme']) }))
  .superRefine((tags, ctx) => {
    const seen = new Set<string>();
    for (const tag of tags) {
      if (seen.has(tag.slug)) ctx.addIssue({ code: 'custom', message: `Etiqueta repetida: ${tag.slug}` });
      seen.add(tag.slug);
    }
  });

const comicFileSchema = z.strictObject({
  title: text,
  synopsis: text,
  authorCredit: text,
  license: text,
  // Se pinta como enlace en la ficha: solo http(s), nunca javascript: ni data:.
  licenseUrl: z.url({ protocol: /^https?$/, error: 'Debe ser una URL http(s)' }).nullable(),
  isAdult: z.boolean(),
  contentWarning: text.nullable(),
  tags: z.array(slug),
  // Solo para los títulos (opcionales); qué capítulos hay lo deciden las carpetas.
  chapters: z.record(z.string().regex(CHAPTER_DIR, { error: 'La clave debe ser el número del capítulo' }), z.strictObject({ title: text.optional() })).default({}),
});
type ComicFile = z.infer<typeof comicFileSchema>;

interface ImageFile {
  file: string; // ruta absoluta
  type: ImageType; // por la firma, no por la extensión
  width: number;
  height: number;
}

interface PlannedChapter {
  number: number;
  title: string;
  panels: ImageFile[];
}

interface Plan {
  slug: string;
  existing: comicsRepository.ComicRef | null;
  comic: ComicFile;
  cover: ImageFile | null; // solo si la obra es nueva
  chapters: PlannedChapter[]; // solo los nuevos
  skipped: number[]; // ya existentes
}

export interface ImportSummary {
  comicsCreated: number;
  chaptersAdded: number;
  chaptersSkipped: number;
  errors: { slug: string; message: string }[];
}

// Motivo legible de una obra omitida; el resto de errores (BD, almacenamiento) se relanzan tal cual.
class ContentError extends Error {}

const zodMessage = (error: z.ZodError) =>
  error.issues.map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message)).join('; ');

async function readJson(file: string, label: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as { code?: unknown }).code === 'ENOENT') throw new ContentError(`Falta ${label}`);
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new ContentError(`Error al leer ${label}: ${(err as Error).message}`);
  }
}

// Número de capítulo o de viñeta: solo dígitos, ≥ 1 y dentro de un INTEGER.
function parseNumber(digits: string, what: string): number {
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_INT) throw new ContentError(`${what} no válido: ${digits}`);
  return value;
}

async function readImage(file: string, label: string): Promise<ImageFile> {
  const { size } = await stat(file);
  if (size > MAX_IMAGE_BYTES) throw new ContentError(`Imagen rechazada (${label}): pasa de ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
  const info = readImageInfo(await readFile(file));
  if (!info) throw new ContentError(`Imagen rechazada (${label}): no es un JPG, PNG ni WebP válido`);
  return { file, ...info };
}

async function readChapter(dir: string, number: number): Promise<ImageFile[]> {
  const byNumber = new Map<number, string>();
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue; // .DS_Store y similares
    const match = PANEL_FILE.exec(entry.name);
    if (!entry.isFile() || !match) {
      throw new ContentError(`Imagen rechazada (capítulo ${number}, ${entry.name}): el nombre debe ser solo un número con extensión .jpg, .png o .webp`);
    }
    const panelNumber = parseNumber(match[1]!, `Número de viñeta (capítulo ${number})`);
    if (byNumber.has(panelNumber)) throw new ContentError(`Capítulo rechazado (${number}): dos viñetas con el número ${panelNumber}`);
    byNumber.set(panelNumber, entry.name);
  }
  if (byNumber.size === 0) throw new ContentError(`Capítulo rechazado (${number}): no tiene imágenes`);
  if (byNumber.size > MAX_PANELS_PER_CHAPTER) {
    throw new ContentError(`Capítulo rechazado (${number}): tiene ${byNumber.size} imágenes y el máximo es ${MAX_PANELS_PER_CHAPTER}`);
  }
  const ordered = [...byNumber.entries()].sort(([a], [b]) => a - b);
  const panels: ImageFile[] = [];
  for (const [, name] of ordered) panels.push(await readImage(path.join(dir, name), `capítulo ${number}, ${name}`));
  return panels;
}

// Valida la carpeta de una obra y decide qué hay que crear. No escribe nada.
async function planComic(contentDir: string, slugName: string, knownTags: ReadonlySet<string>, requestId: string): Promise<Plan> {
  if (!SLUG.test(slugName)) {
    throw new ContentError('Nombre de carpeta no válido: solo minúsculas, números y guiones entre palabras (sin acentos, espacios ni guiones bajos)');
  }
  const dir = path.join(contentDir, slugName);

  const chapterDirs = new Map<number, string>();
  let coverName: string | null = null;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === COMIC_FILE) continue;
    if (entry.isFile() && COVER_FILE.test(entry.name)) {
      if (coverName) throw new ContentError(`Hay dos portadas: ${coverName} y ${entry.name}`);
      coverName = entry.name;
    } else if (entry.isDirectory() && CHAPTER_DIR.test(entry.name)) {
      const number = parseNumber(entry.name, 'Capítulo rechazado: número');
      if (chapterDirs.has(number)) throw new ContentError(`Capítulo rechazado: dos carpetas con el número ${number}`);
      chapterDirs.set(number, entry.name);
    } else if (entry.isDirectory()) {
      throw new ContentError(`Capítulo rechazado (${entry.name}): la carpeta debe ser solo un número (001, 002…)`);
    } else {
      throw new ContentError(`Archivo no esperado: ${entry.name} (solo comic.json, la portada cover.* y las carpetas de capítulo)`);
    }
  }

  const parsed = comicFileSchema.safeParse(await readJson(path.join(dir, COMIC_FILE), COMIC_FILE));
  if (!parsed.success) throw new ContentError(`${COMIC_FILE} no válido: ${zodMessage(parsed.error)}`);
  const comic = parsed.data;
  if (comic.isAdult) throw new ContentError('Obra para adultos rechazada (RN-17): isAdult debe ser false');
  const unknownTags = comic.tags.filter((tag) => !knownTags.has(tag));
  if (unknownTags.length > 0) throw new ContentError(`Etiqueta que no existe en ${TAGS_FILE}: ${unknownTags.join(', ')}`);

  const titles = new Map<number, string>();
  for (const [key, value] of Object.entries(comic.chapters)) {
    const number = parseNumber(key, `${COMIC_FILE}: capítulo`);
    if (titles.has(number)) throw new ContentError(`${COMIC_FILE}: el capítulo ${number} aparece dos veces`);
    titles.set(number, value.title ?? `Capítulo ${number}`);
  }

  const existing = await comicsRepository.findComicRefBySlug(pool, slugName);
  if (existing && existing.authorId !== null) {
    throw new ContentError('El nombre ya lo usa una obra de un autor: la importación no la modifica');
  }
  if (existing?.deletedAt) throw new ContentError('La obra está retirada (RN-06): no se le añaden capítulos');
  const existingNumbers = existing ? await chaptersRepository.findChapterNumbers(pool, existing.id) : new Set<number>();

  const chapters: PlannedChapter[] = [];
  const skipped: number[] = [];
  for (const [number, name] of [...chapterDirs.entries()].sort(([a], [b]) => a - b)) {
    if (existingNumbers.has(number)) {
      skipped.push(number);
      continue;
    }
    const panels = await readChapter(path.join(dir, name), number);
    chapters.push({ number, title: titles.get(number) ?? `Capítulo ${number}`, panels });
  }
  for (const number of titles.keys()) {
    if (!chapterDirs.has(number)) logger.warn('Capítulo de comic.json sin carpeta', { requestId, slug: slugName, chapter: number });
  }

  const cover = !existing && coverName ? await readImage(path.join(dir, coverName), coverName) : null;
  return { slug: slugName, existing, comic, cover, chapters, skipped };
}

async function upload(storage: StorageDriver, image: ImageFile): Promise<string> {
  const key = newImageKey(image.type);
  await storage.put(key, image.file, IMAGE_CONTENT_TYPES[image.type]);
  return key;
}

// Sube las imágenes y registra la obra en una transacción. Las imágenes van antes que la BD: la BD nunca
// apunta a una imagen que no existe (si la transacción falla, quedan huérfanas: riesgo aceptado).
async function applyPlan(plan: Plan, storage: StorageDriver, requestId: string): Promise<void> {
  const coverKey = plan.cover ? await upload(storage, plan.cover) : null;
  const chapters: { number: number; title: string; panels: chaptersRepository.NewPanel[] }[] = [];
  for (const chapter of plan.chapters) {
    const panels: chaptersRepository.NewPanel[] = [];
    for (const image of chapter.panels) panels.push({ imageKey: await upload(storage, image), width: image.width, height: image.height });
    chapters.push({ ...chapter, panels });
  }

  await withTransaction(async (client) => {
    let comicId = plan.existing?.id;
    if (comicId === undefined) {
      const { comic } = plan;
      comicId = await comicsRepository.insertComic(client, {
        slug: plan.slug,
        title: comic.title,
        synopsis: comic.synopsis,
        authorId: null,
        authorCredit: comic.authorCredit,
        license: comic.license,
        licenseUrl: comic.licenseUrl,
        isAdult: false,
        contentWarning: comic.contentWarning,
        coverKey,
        status: 'approved',
      });
      await comicsRepository.addComicTags(client, comicId, comic.tags);
    }
    for (const chapter of chapters) {
      const chapterId = await chaptersRepository.insertApprovedChapter(client, comicId, chapter.number, chapter.title);
      await chaptersRepository.insertPanels(client, chapterId, chapter.panels);
    }
    await audit.record(client, {
      action: 'content.import',
      actorId: null,
      entityType: 'comics',
      entityId: String(comicId),
      after: { slug: plan.slug, chapters: chapters.map((chapter) => chapter.number) },
      ip: null,
      requestId,
    });
  });
}

export interface ImportOptions {
  contentDir: string; // ruta absoluta
  storage: StorageDriver;
  requestId: string;
}

export async function importContent({ contentDir, storage, requestId }: ImportOptions): Promise<ImportSummary> {
  logger.info('Importación: destino', { requestId, ...databaseTarget(), storageDriver: storage.name, contentDir });

  // Sin un tags.json válido no se puede validar ninguna obra: se para todo.
  let tags: z.infer<typeof tagsFileSchema>;
  try {
    const parsed = tagsFileSchema.safeParse(await readJson(path.join(contentDir, TAGS_FILE), TAGS_FILE));
    if (!parsed.success) throw new ContentError(`${TAGS_FILE} no válido: ${zodMessage(parsed.error)}`);
    tags = parsed.data;
  } catch (err) {
    if (err instanceof ContentError) throw new Error(`Importación cancelada: ${err.message}`);
    throw err;
  }
  await comicsRepository.upsertTags(pool, tags);
  const knownTags = new Set(tags.map((tag) => tag.slug));

  const summary: ImportSummary = { comicsCreated: 0, chaptersAdded: 0, chaptersSkipped: 0, errors: [] };
  const entries = await readdir(contentDir, { withFileTypes: true });
  const comicDirs = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort();
  for (const entry of entries) {
    if (!entry.isDirectory() && entry.name !== TAGS_FILE && !entry.name.startsWith('.')) {
      logger.warn('Archivo ignorado en la raíz de content/', { requestId, file: entry.name });
    }
  }

  for (const slugName of comicDirs) {
    try {
      const plan = await planComic(contentDir, slugName, knownTags, requestId);
      summary.chaptersSkipped += plan.skipped.length;
      if (plan.existing && plan.chapters.length === 0) {
        logger.info('Obra sin cambios', { requestId, slug: slugName, skipped: plan.skipped });
        continue;
      }
      await applyPlan(plan, storage, requestId);
      if (!plan.existing) summary.comicsCreated++;
      summary.chaptersAdded += plan.chapters.length;
      logger.info('Obra importada', {
        requestId,
        slug: slugName,
        created: !plan.existing,
        chapters: plan.chapters.map((chapter) => chapter.number),
        skipped: plan.skipped,
      });
    } catch (err) {
      const message = err instanceof ContentError ? err.message : `Error inesperado: ${(err as Error).message}`;
      summary.errors.push({ slug: slugName, message });
      if (err instanceof ContentError) logger.warn('Obra omitida', { requestId, slug: slugName, reason: message });
      else logger.error('Obra omitida por un error inesperado', { requestId, slug: slugName, err });
    }
  }

  logger.info('Importación terminada', {
    requestId,
    comicsCreated: summary.comicsCreated,
    chaptersAdded: summary.chaptersAdded,
    chaptersSkipped: summary.chaptersSkipped,
    comicsWithErrors: summary.errors.length,
  });
  return summary;
}

if (import.meta.main) {
  const requestId = randomUUID();
  try {
    const { storage } = await import('../integrations/storage/index.js');
    const summary = await importContent({ contentDir: path.resolve(paths.root, env.CONTENT_DIR), storage, requestId });
    if (summary.errors.length > 0) process.exitCode = 1;
  } catch (err) {
    logger.error('Importación fallida', { requestId, err });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
