import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { checkDemoTarget } from './demo-guard.js';
import { flatImagePng, type Rgb } from './demo-png.js';

// `npm run demo:data`: datos de demostración para el panel del autor, SOLO en la BD local de desarrollo
// (demo-guard.ts lo comprueba antes de cargar nada). Idempotente: una segunda ejecución no duplica nada.
//
// - Obras, portadas, capítulos, viñetas y envíos a revisión: por la API real, como la autora demo
//   (author@demo.test), con `app` levantada en 127.0.0.1 en un puerto libre y el Origin propio (CSRF).
// - Aprobar y rechazar (el panel del admin llega en el bloque 4): por SQL, con su auditoría (actor NULL = sistema).
// - 6 lectores, sus lecturas de los últimos 14 días, su viñeta máxima (RN-21) y ~30 comentarios: por SQL. El registro admite 3 altas por hora
//   (RN-13), la lectura solo registra el día de hoy y el limitador de comentarios no deja fechas pasadas.
// Las imágenes se generan en un temporal del sistema que se borra al terminar: nunca en el repositorio.

type ChapterTarget = 'draft' | 'pending' | 'approved';

interface DemoComic {
  title: string;
  synopsis: string;
  tags: readonly [string, string]; // género, tema (slugs del seed)
  color: Rgb;
  target: 'approved' | 'pending' | 'rejected';
  rejectionReason?: string;
  chapters: readonly { title: string; target: ChapterTarget }[];
}

const DEMO_COMICS: readonly DemoComic[] = [
  {
    title: 'Faro de medianoche',
    synopsis: 'Cada noche, la farera de un pueblo costero apaga la luz a las doce. Esta vez, alguien la vuelve a encender.',
    tags: ['misterio', 'sobrenatural'],
    color: [38, 70, 120],
    target: 'approved',
    chapters: [
      { title: 'La luz de las doce', target: 'approved' },
      { title: 'Huellas en la escalera', target: 'approved' },
      { title: 'El cuaderno del farero', target: 'approved' },
      { title: 'Marea baja', target: 'draft' },
    ],
  },
  {
    title: 'Recetas para un dragón',
    synopsis: 'Un cocinero sin estrellas acepta el peor encargo del reino: el menú semanal de un dragón con el estómago delicado.',
    tags: ['comedia', 'magia'],
    color: [150, 60, 40],
    target: 'approved',
    chapters: [
      { title: 'Caldo de bienvenida', target: 'approved' },
      { title: 'Nada de picante', target: 'approved' },
      { title: 'El postre prohibido', target: 'approved' },
      { title: 'Banquete real', target: 'pending' },
    ],
  },
  {
    title: 'La biblioteca sumergida',
    synopsis: 'Bajo el lago hay una biblioteca que solo se puede visitar conteniendo la respiración. Una lectora decide quedarse.',
    tags: ['fantasia', 'psicologico'],
    color: [30, 110, 100],
    target: 'pending',
    chapters: [
      { title: 'Primera inmersión', target: 'pending' },
      { title: 'El índice de las mareas', target: 'pending' },
      { title: 'Libros que respiran', target: 'draft' },
      { title: 'La sala sin aire', target: 'draft' },
    ],
  },
  {
    title: 'Cartas desde Kepler',
    synopsis: 'Una astronauta en una colonia lejana escribe cartas que tardan seis años en llegar a casa.',
    tags: ['ciencia-ficcion', 'slice-of-life'],
    color: [90, 50, 120],
    target: 'rejected',
    rejectionReason: 'Las viñetas de muestra no tienen calidad suficiente para publicarse: sustitúyelas por las definitivas.',
    chapters: [
      { title: 'Carta uno', target: 'pending' },
      { title: 'Carta dos', target: 'pending' },
      { title: 'Carta tres', target: 'draft' },
      { title: 'Carta cuatro', target: 'draft' },
    ],
  },
];

const PANELS_PER_CHAPTER = 3;
const PANEL_SIZE = { width: 800, height: 1200 };
const COVER_SIZE = { width: 600, height: 900 };
const WHITE: Rgb = [245, 245, 245];
const DEMO_READERS = 6; // lector1…6@demo.test, con la contraseña de SEED_READER_PASSWORD
const READERS_PER_CHAPTER = [6, 4, 3]; // capítulos 1, 2 y 3: cada vez menos lectores
const COMMENT_TEXTS = [
  '¡Qué ambiente tiene esta viñeta!',
  'No me esperaba este giro.',
  'Los colores de esta página son preciosos.',
  'Necesito el siguiente capítulo ya.',
  'Me encanta cómo dibuja las manos.',
  'Esta escena me ha puesto los pelos de punta.',
  'Jajaja, el dragón tiene razón.',
  '¿Alguien más ha visto la sombra del fondo?',
  'Lo he releído tres veces.',
  'El encuadre de esta viñeta es de cine.',
  'Pobre farera, no la dejan en paz.',
  'Quiero esa receta en mi vida.',
  'Este personaje se merece su propia historia.',
  'La tipografía del bocadillo es perfecta.',
  'Me ha recordado a los cómics de mi infancia.',
  'Sabía que el cuaderno escondía algo.',
  'Qué ritmo tiene este capítulo.',
  'El silencio de esta página dice mucho.',
  'Por favor, que no le pase nada al cocinero.',
  'Esta viñeta podría ser un póster.',
  'Me encanta la paleta de azules.',
  'La expresión de la cara lo dice todo.',
  'Vengo cada semana solo por esta serie.',
  'Ese final de capítulo es cruel.',
  'Gracias por compartir tu trabajo.',
  'Las sombras están muy bien resueltas.',
  'He compartido esta viñeta con mis amigos.',
  'No entiendo nada y me encanta.',
  'Teoría: la luz la enciende el faro mismo.',
  'Más capítulos así, por favor.',
];

// Respuestas de la API que usa el script (contrato del bloque 3), validadas con zod: solo los campos que lee.
const authorChapterSchema = z.object({
  number: z.number().int(),
  status: z.enum(['draft', 'pending', 'approved', 'rejected']),
  panelCount: z.number().int(),
});
const authorComicSchema = z.object({
  slug: z.string(),
  title: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
  coverUrl: z.string().nullable(),
  chapters: z.array(authorChapterSchema),
});
export const tagsResponse = z.object({ tags: z.array(z.object({ slug: z.string() })) });
export const comicsResponse = z.object({ comics: z.array(authorComicSchema) });
export const comicResponse = z.object({ comic: authorComicSchema });
export const chapterResponse = z.object({ chapter: authorChapterSchema });

type AuthorChapter = z.infer<typeof authorChapterSchema>;
type AuthorComic = z.infer<typeof authorComicSchema>;

export interface DemoSummary {
  comics: { created: number; existing: number };
  covers: number;
  chapters: { created: number; existing: number };
  panels: number;
  submitted: number;
  approved: { comics: number; chapters: number };
  rejected: number;
  readers: { created: number; existing: number };
  reads: { chapters: number; skipped: number; userReads: number; guestReads: number; progress: number };
  comments: { created: number; existing: number; skipped: number };
}

// --- Cliente HTTP de la API real ---

interface RequestBody {
  json?: unknown;
  form?: FormData;
}

class Api {
  cookie = '';
  constructor(
    private readonly baseUrl: string,
    private readonly origin: string,
  ) {}

  // Sin esquema, la respuesta no se lee (`unknown`); con esquema, se valida y una forma inesperada aborta el script.
  async call(method: string, route: string, expected: number, body?: RequestBody): Promise<unknown> {
    const headers: Record<string, string> = { Origin: this.origin };
    if (this.cookie) headers['Cookie'] = this.cookie;
    let payload: string | FormData | undefined;
    if (body?.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body.json);
    } else if (body?.form) {
      payload = body.form;
    }
    const res = await fetch(`${this.baseUrl}${route}`, { method, headers, ...(payload !== undefined && { body: payload }) });
    const session = res.headers.getSetCookie().find((cookie) => cookie.startsWith('koma_session='));
    if (session) this.cookie = session.split(';')[0]!;
    const text = await res.text();
    if (res.status !== expected) throw new Error(`${method} ${route}: ${res.status} ${text}`);
    if (!text) return null;
    const data: unknown = JSON.parse(text);
    return data;
  }

  async read<S extends z.ZodType>(schema: S, method: string, route: string, expected: number, body?: RequestBody): Promise<z.infer<S>> {
    const result = schema.safeParse(await this.call(method, route, expected, body));
    if (!result.success) throw new Error(`${method} ${route}: respuesta inesperada: ${z.prettifyError(result.error)}`);
    return result.data;
  }
}

async function imageForm(file: string): Promise<FormData> {
  const form = new FormData();
  form.append('image', new Blob([await readFile(file)], { type: 'image/png' }), path.basename(file));
  return form;
}

// --- API: obras, portadas, capítulos, viñetas y envíos ---

async function buildContent(api: Api, dir: string, summary: DemoSummary): Promise<AuthorComic[]> {
  const { tags } = await api.read(tagsResponse, 'GET', '/api/tags', 200);
  const known = new Set(tags.map((tag) => tag.slug));
  for (const comic of DEMO_COMICS) {
    for (const tag of comic.tags) if (!known.has(tag)) throw new Error(`Falta la etiqueta ${tag}: ejecuta antes npm run seed`);
  }

  let { comics } = await api.read(comicsResponse, 'GET', '/api/author/comics', 200);
  for (const [index, spec] of DEMO_COMICS.entries()) {
    const label = `OBRA ${index + 1}`;
    let comic = comics.find((candidate) => candidate.title === spec.title);
    if (comic) {
      summary.comics.existing++;
    } else {
      ({ comic } = await api.read(comicResponse, 'POST', '/api/author/comics', 201, {
        json: {
          title: spec.title,
          synopsis: spec.synopsis,
          authorCredit: 'Autora Demo',
          license: 'cc-by-4.0',
          tags: [...spec.tags],
          contentWarning: null,
          isAdult: false,
          authorshipDeclared: true,
        },
      }));
      summary.comics.created++;
    }
    if (comic.status === 'rejected') continue; // D8: una rechazada no admite portada ni capítulos

    if (!comic.coverUrl) {
      const file = path.join(dir, `cover-${index + 1}.png`);
      await writeFile(file, flatImagePng(COVER_SIZE.width, COVER_SIZE.height, spec.color, WHITE, [label, 'PORTADA']));
      await api.call('PUT', `/api/author/comics/${comic.slug}/cover`, 200, { form: await imageForm(file) });
      summary.covers++;
    }

    for (const [chapterIndex, chapterSpec] of spec.chapters.entries()) {
      const number = chapterIndex + 1;
      const chapterUrl = `/api/author/comics/${comic.slug}/chapters/${number}`;
      let chapter = comic.chapters.find((candidate) => candidate.number === number && candidate.status !== 'rejected');
      if (chapter) {
        summary.chapters.existing++;
      } else {
        ({ chapter } = await api.read(chapterResponse, 'POST', `/api/author/comics/${comic.slug}/chapters`, 201, {
          json: { number, title: chapterSpec.title },
        }));
        summary.chapters.created++;
      }
      if (chapter.status !== 'draft') continue;
      if (chapter.panelCount === 0) {
        for (let position = 1; position <= PANELS_PER_CHAPTER; position++) {
          const shade: Rgb = [spec.color[0] + number * 12, spec.color[1] + number * 12, spec.color[2] + number * 12];
          const file = path.join(dir, `panel-${index + 1}-${number}-${position}.png`);
          await writeFile(file, flatImagePng(PANEL_SIZE.width, PANEL_SIZE.height, shade, WHITE, [label, `CAP ${number}`, String(position).padStart(2, '0')]));
          await api.call('POST', `${chapterUrl}/panels`, 201, { form: await imageForm(file) });
          summary.panels++;
        }
      }
      if (chapterSpec.target !== 'draft') {
        await api.call('POST', `${chapterUrl}/submit`, 200);
        summary.submitted++;
      }
    }
  }
  ({ comics } = await api.read(comicsResponse, 'GET', '/api/author/comics', 200));
  return comics;
}

// --- SQL: lo que en el bloque 4 hará el admin, con la misma auditoría (actor NULL = sistema) ---

type Audit = typeof import('../modules/audit/audit.service.js');
type AuditEntityType = import('../modules/audit/audit.service.js').AuditEntityType;

async function moderate(client: PoolClient, audit: Audit, requestId: string, comics: readonly AuthorComic[], summary: DemoSummary): Promise<void> {
  const record = (action: 'comic.approve' | 'comic.reject' | 'chapter.approve', entityType: AuditEntityType, id: number, before: object, after: object) =>
    audit.record(client, { action, actorId: null, entityType, entityId: String(id), before, after, ip: null, requestId });

  for (const [index, spec] of DEMO_COMICS.entries()) {
    const comic = comics.find((candidate) => candidate.title === spec.title);
    if (!comic) continue;
    const { rows } = await client.query<{ id: number; status: string }>('SELECT id, status FROM comics WHERE slug = $1 FOR UPDATE', [comic.slug]);
    const row = rows[0]!;
    if (row.status === 'pending' && spec.target === 'approved') {
      await client.query(`UPDATE comics SET status = 'approved' WHERE id = $1`, [row.id]);
      await record('comic.approve', 'comics', row.id, { status: 'pending' }, { status: 'approved' });
      summary.approved.comics++;
    } else if (row.status === 'pending' && spec.target === 'rejected') {
      await client.query(`UPDATE comics SET status = 'rejected', rejection_reason = $2 WHERE id = $1`, [row.id, spec.rejectionReason]);
      await record('comic.reject', 'comics', row.id, { status: 'pending', rejectionReason: null }, { status: 'rejected', rejectionReason: spec.rejectionReason });
      summary.rejected++;
      continue;
    }
    if (spec.target !== 'approved') continue;

    for (const [chapterIndex, chapterSpec] of spec.chapters.entries()) {
      if (chapterSpec.target !== 'approved') continue;
      // Publicados escalonados en los últimos 14 días: el capítulo 1 hace 13 o 12 días, el 3 hace 5 o 4.
      const daysAgo = 13 - chapterIndex * 4 - index;
      const { rows: updated } = await client.query<{ id: number; published_at: Date }>(
        `UPDATE chapters SET status = 'approved',
                published_at = ((((now() AT TIME ZONE 'Europe/Madrid')::date - $3::int) + time '10:00') AT TIME ZONE 'Europe/Madrid')
         WHERE comic_id = $1 AND number = $2 AND status = 'pending' AND deleted_at IS NULL
         RETURNING id, published_at`,
        [row.id, chapterIndex + 1, daysAgo],
      );
      const chapter = updated[0];
      if (chapter) {
        await record('chapter.approve', 'chapters', chapter.id, { status: 'pending', publishedAt: null }, { status: 'approved', publishedAt: chapter.published_at.toISOString() });
        summary.approved.chapters++;
      }
    }
  }
}

// --- SQL: lectores, lecturas y comentarios ---

async function createReaders(client: PoolClient, audit: Audit, requestId: string, passwordHash: string, summary: DemoSummary): Promise<number[]> {
  const ids: number[] = [];
  for (let n = 1; n <= DEMO_READERS; n++) {
    const email = `lector${n}@demo.test`;
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3)
       ON CONFLICT ((lower(email))) DO NOTHING RETURNING id`,
      [email, passwordHash, `Lector ${n}`],
    );
    if (rows[0]) {
      await audit.record(client, { action: 'system.seed', actorId: null, entityType: 'users', entityId: String(rows[0].id), after: { id: rows[0].id, email }, ip: null, requestId });
      summary.readers.created++;
      ids.push(rows[0].id);
    } else {
      summary.readers.existing++;
      const existing = await client.query<{ id: number }>('SELECT id FROM users WHERE lower(email) = $1', [email]);
      ids.push(existing.rows[0]!.id);
    }
  }
  return ids;
}

// Solo capítulos sin ninguna fila en chapter_read_counts: así no se repiten ni se mezclan con lecturas reales.
// Todas las fechas van de la publicación a ayer, en días de Europe/Madrid.
async function addReads(client: PoolClient, comics: readonly AuthorComic[], readers: readonly number[], summary: DemoSummary): Promise<void> {
  const slugs = DEMO_COMICS.map((spec) => comics.find((comic) => comic.title === spec.title)?.slug).filter((slug): slug is string => slug !== undefined);
  const { rows: chapters } = await client.query<{ id: number; number: number; comic_index: number; days: number; has_reads: boolean }>(
    `SELECT ch.id, ch.number, array_position($1::text[], co.slug) - 1 AS comic_index,
            ((now() AT TIME ZONE 'Europe/Madrid')::date - (ch.published_at AT TIME ZONE 'Europe/Madrid')::date) AS days,
            EXISTS (SELECT 1 FROM chapter_read_counts r WHERE r.chapter_id = ch.id) AS has_reads
     FROM chapters ch JOIN comics co ON co.id = ch.comic_id
     WHERE co.slug = ANY($1::text[]) AND co.status = 'approved' AND co.deleted_at IS NULL
       AND ch.status = 'approved' AND ch.deleted_at IS NULL
     ORDER BY comic_index, ch.number`,
    [slugs],
  );
  for (const chapter of chapters) {
    if (chapter.has_reads || chapter.days < 1) {
      summary.reads.skipped++;
      continue;
    }
    summary.reads.chapters++;
    const readersHere = READERS_PER_CHAPTER[chapter.number - 1] ?? 2;
    for (const [u, userId] of readers.slice(0, readersHere).entries()) {
      const daysAgo = 1 + ((u * 5 + chapter.number * 3 + chapter.comic_index) % chapter.days);
      const { rowCount } = await client.query(
        `INSERT INTO chapter_reads (user_id, chapter_id, first_read_at, last_read_at)
         SELECT $1, $2, t.at, t.at
         FROM (SELECT ((((now() AT TIME ZONE 'Europe/Madrid')::date - $3::int) + time '20:00' - make_interval(mins => $4::int)) AT TIME ZONE 'Europe/Madrid') AS at) t
         ON CONFLICT DO NOTHING`,
        [userId, chapter.id, daysAgo, u * 37],
      );
      if (rowCount) {
        await client.query(
          `INSERT INTO chapter_read_counts (chapter_id, day, user_reads)
           VALUES ($1, (now() AT TIME ZONE 'Europe/Madrid')::date - $2::int, 1)
           ON CONFLICT (chapter_id, day) DO UPDATE SET user_reads = chapter_read_counts.user_reads + 1`,
          [chapter.id, daysAgo],
        );
        summary.reads.userReads++;
      }
    }
    for (let daysAgo = chapter.days; daysAgo >= 1; daysAgo--) {
      // Más invitados los primeros días tras publicar y en los primeros capítulos; un poco de variación fija.
      const sinceRelease = chapter.days - daysAgo;
      const guests = Math.max(0, 9 - 2 * (chapter.number - 1) - chapter.comic_index - Math.floor(sinceRelease / 3) + ((daysAgo * 7 + chapter.number) % 4));
      if (guests === 0) continue;
      await client.query(
        `INSERT INTO chapter_read_counts (chapter_id, day, guest_reads)
         VALUES ($1, (now() AT TIME ZONE 'Europe/Madrid')::date - $2::int, $3)
         ON CONFLICT (chapter_id, day) DO UPDATE SET guest_reads = chapter_read_counts.guest_reads + EXCLUDED.guest_reads`,
        [chapter.id, daysAgo, guests],
      );
      summary.reads.guestReads += guests;
    }
  }
}

// RN-21 (bloque 5): viñeta máxima de cada lector demo en cada capítulo. Solo depende de quién lee (índice del lector),
// del capítulo y de la obra: repetir el script da lo mismo. Unos 6 de cada 10 llegan al final; el resto se queda entre
// 1 y 4 viñetas antes (nunca por debajo de la 1).
export function demoLastPanel(reader: number, chapterNumber: number, comicIndex: number, panels: number): number {
  const h = (reader * 7 + chapterNumber * 5 + comicIndex * 3) % 10;
  return h < 6 ? panels : Math.max(1, panels - (h - 5));
}

// Rellena last_panel solo donde es NULL (nunca pisa un progreso real ni uno ya puesto), con demoLastPanel.
async function addProgress(client: PoolClient, comics: readonly AuthorComic[], readers: readonly number[], summary: DemoSummary): Promise<void> {
  const slugs = DEMO_COMICS.map((spec) => comics.find((comic) => comic.title === spec.title)?.slug).filter((slug): slug is string => slug !== undefined);
  const { rows } = await client.query<{ user_id: number; chapter_id: number; number: number; comic_index: number; panels: number }>(
    `SELECT cr.user_id, cr.chapter_id, ch.number, array_position($1::text[], co.slug) - 1 AS comic_index,
            (SELECT count(*)::int FROM panels p WHERE p.chapter_id = ch.id) AS panels
     FROM chapter_reads cr
     JOIN chapters ch ON ch.id = cr.chapter_id
     JOIN comics co ON co.id = ch.comic_id
     WHERE co.slug = ANY($1::text[]) AND cr.user_id = ANY($2::int[]) AND cr.last_panel IS NULL`,
    [slugs, readers],
  );
  for (const row of rows) {
    if (row.panels === 0) continue;
    const panel = demoLastPanel(readers.indexOf(row.user_id), row.number, row.comic_index, row.panels);
    const { rowCount } = await client.query('UPDATE chapter_reads SET last_panel = $3 WHERE user_id = $1 AND chapter_id = $2 AND last_panel IS NULL', [
      row.user_id,
      row.chapter_id,
      panel,
    ]);
    summary.reads.progress += rowCount ?? 0;
  }
}

export interface CommentSlot {
  comicIndex: number; // en DEMO_COMICS
  chapterNumber: number;
  position: number; // viñeta
  reader: number; // 1…DEMO_READERS (lectorN@demo.test)
  body: string;
}

// Cada texto de COMMENT_TEXTS tiene un sitio fijo (obra, capítulo, viñeta, lector) que sale solo de DEMO_COMICS y
// READERS_PER_CHAPTER, nunca de lo que haya en la BD: repetir el script no lo mueve aunque cambien las lecturas
// (p. ej., al aprobar "Banquete real"). Los sitios son los de quienes leen cada capítulo aprobado (addReads), en el
// mismo orden que usaba la primera versión del script, así que los comentarios ya creados coinciden.
export function commentSlots(): CommentSlot[] {
  const readings: { comicIndex: number; chapterNumber: number; reader: number }[] = [];
  for (const [comicIndex, spec] of DEMO_COMICS.entries()) {
    if (spec.target !== 'approved') continue;
    for (const [chapterIndex, chapter] of spec.chapters.entries()) {
      if (chapter.target !== 'approved') continue;
      const chapterNumber = chapterIndex + 1;
      const readersHere = READERS_PER_CHAPTER[chapterIndex] ?? 2;
      for (let reader = 1; reader <= readersHere; reader++) readings.push({ comicIndex, chapterNumber, reader });
    }
  }
  return COMMENT_TEXTS.map((body, k) => ({ ...readings[(k * 7) % readings.length]!, position: (k % PANELS_PER_CHAPTER) + 1, body }));
}

// ~30 comentarios, cada uno en su sitio fijo (commentSlots) y después de la lectura de quien lo escribe. Idempotente
// por (usuario, viñeta, texto). Sin esa lectura (el capítulo ya tenía lecturas reales y addReads lo omitió), se omite.
async function addComments(client: PoolClient, comics: readonly AuthorComic[], readers: readonly number[], summary: DemoSummary): Promise<void> {
  for (const [k, slot] of commentSlots().entries()) {
    const slug = comics.find((comic) => comic.title === DEMO_COMICS[slot.comicIndex]!.title)?.slug;
    const userId = readers[slot.reader - 1];
    if (slug === undefined || userId === undefined) {
      summary.comments.skipped++;
      continue;
    }
    const { rows } = await client.query<{ exists: boolean; inserted: boolean }>(
      `WITH target AS (
         SELECT p.id AS panel_id, r.first_read_at
         FROM comics co
         JOIN chapters ch ON ch.comic_id = co.id AND ch.number = $2 AND ch.status = 'approved' AND ch.deleted_at IS NULL
         JOIN panels p ON p.chapter_id = ch.id AND p.position = $3
         JOIN chapter_reads r ON r.chapter_id = ch.id AND r.user_id = $4
         WHERE co.slug = $1
       ),
       existing AS (
         SELECT 1 FROM comments c JOIN target t ON c.panel_id = t.panel_id WHERE c.user_id = $4 AND c.body = $5
       ),
       inserted AS (
         INSERT INTO comments (panel_id, user_id, body, created_at)
         SELECT t.panel_id, $4, $5, t.first_read_at + make_interval(mins => $6::int)
         FROM target t
         WHERE NOT EXISTS (SELECT 1 FROM existing)
         RETURNING 1
       )
       SELECT EXISTS (SELECT 1 FROM existing) AS exists, EXISTS (SELECT 1 FROM inserted) AS inserted`,
      [slug, slot.chapterNumber, slot.position, userId, slot.body, 3 + ((k * 11) % 50)],
    );
    if (rows[0]!.inserted) summary.comments.created++;
    else if (rows[0]!.exists) summary.comments.existing++;
    else summary.comments.skipped++;
  }
}

// --- Arranque ---

async function main(): Promise<void> {
  // Antes de cargar env, pool o app: si el destino no es local, no se conecta a nada.
  const target = checkDemoTarget(process.env);
  if (!target.ok) {
    console.error(`demo:data: abortado: ${target.reason}. No se ha tocado nada.`);
    process.exitCode = 1;
    return;
  }

  const requestId = randomUUID();
  const { env } = await import('../config/env.js');
  const { pool, withTransaction } = await import('../db/pool.js');
  const { logger } = await import('../utils/logger.js');
  const audit = await import('../modules/audit/audit.service.js');
  const { hashPassword, passwordProblem } = await import('../utils/password.js');
  const { app } = await import('../app.js');

  console.log(`demo:data: BD ${target.dbName} en ${target.dbHost} · STORAGE_DRIVER=${env.STORAGE_DRIVER} · requestId ${requestId}`);
  const authorPassword = env.SEED_AUTHOR_PASSWORD;
  const readerPassword = env.SEED_READER_PASSWORD;
  if (!authorPassword || !readerPassword || passwordProblem(readerPassword) !== null) {
    console.error('demo:data: faltan SEED_AUTHOR_PASSWORD o SEED_READER_PASSWORD válidas (las del seed).');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const summary: DemoSummary = {
    comics: { created: 0, existing: 0 },
    covers: 0,
    chapters: { created: 0, existing: 0 },
    panels: 0,
    submitted: 0,
    approved: { comics: 0, chapters: 0 },
    rejected: 0,
    readers: { created: 0, existing: 0 },
    reads: { chapters: 0, skipped: 0, userReads: 0, guestReads: 0, progress: 0 },
    comments: { created: 0, existing: 0, skipped: 0 },
  };
  // Todo lo que deja algo abierto o en disco va dentro del try: el finally cierra el servidor, borra el temporal y
  // cierra el pool aunque falle cualquier paso, también mkdtemp o listen.
  let dir: string | undefined;
  let server: Server | undefined;
  try {
    dir = await mkdtemp(path.join(tmpdir(), 'koma-demo-'));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening'); // si listen falla, `once` rechaza con el evento 'error'
    const { port } = server.address() as AddressInfo;
    const api = new Api(`http://127.0.0.1:${port}`, env.ALLOWED_ORIGINS[0]!);
    await api.call('POST', '/api/auth/login', 200, { json: { email: 'author@demo.test', password: authorPassword } });
    const comics = await buildContent(api, dir, summary);

    const passwordHash = await hashPassword(readerPassword); // fuera de la transacción, que así dura poco
    await withTransaction(async (client) => {
      await moderate(client, audit, requestId, comics, summary);
      const readers = await createReaders(client, audit, requestId, passwordHash, summary);
      await addReads(client, comics, readers, summary);
      await addProgress(client, comics, readers, summary);
      await addComments(client, comics, readers, summary);
    });

    logger.info('Datos de demostración', { requestId, summary });
    console.log(
      [
        `Obras: ${summary.comics.created} creadas, ${summary.comics.existing} ya existían · portadas subidas: ${summary.covers}`,
        `Capítulos: ${summary.chapters.created} creados, ${summary.chapters.existing} ya existían · viñetas subidas: ${summary.panels} · enviados a revisión: ${summary.submitted}`,
        `Moderación (SQL): ${summary.approved.comics} obras y ${summary.approved.chapters} capítulos aprobados, ${summary.rejected} obras rechazadas`,
        `Lectores: ${summary.readers.created} creados, ${summary.readers.existing} ya existían (lector1…${DEMO_READERS}@demo.test, contraseña de SEED_READER_PASSWORD)`,
        `Lecturas: ${summary.reads.chapters} capítulos con lecturas nuevas (${summary.reads.userReads} de registrados, ${summary.reads.guestReads} de invitados), ${summary.reads.skipped} omitidos porque ya tenían · viñeta máxima puesta en ${summary.reads.progress} lecturas`,
        `Comentarios: ${summary.comments.created} creados, ${summary.comments.existing} ya existían, ${summary.comments.skipped} omitidos (sin la lectura de quien comenta)`,
      ].join('\n'),
    );
  } catch (err) {
    logger.error('Datos de demostración: error', { requestId, err });
    process.exitCode = 1;
  } finally {
    server?.close();
    if (dir) await rm(dir, { recursive: true, force: true });
    await pool.end();
  }
}

if (import.meta.main) await main();
