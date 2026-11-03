import { randomBytes } from 'node:crypto';
import { newImageKey } from '../../utils/image.js';
import { SESSION_COOKIE } from './helpers.js';

// Datos de prueba de la ficha, el anuncio y la lectura (contrato del bloque 2) en koma_test. Los archivos de
// test corren en paralelo sobre la misma BD: cada usuario y obra lleva el sufijo RUN. La BD y la sesión se
// importan dentro de cada función, para que el archivo de test pueda fijar process.env antes (env.ts lee
// las variables al cargarse).

export const RUN = randomBytes(3).toString('hex');

const db = async () => (await import('../../db/pool.js')).pool;

export type Kind = 'reader' | 'premium' | 'admin' | 'author';

export interface TestUser {
  id: number;
  cookie: string; // "koma_session=<jwt>", lista para la cabecera Cookie
}

let users = 0;

// Usuario creado directamente en la BD (sin login: los límites de RN-13 no entran en juego), con su sesión.
export async function createUser(kind: Kind): Promise<TestUser> {
  users++;
  const { rows } = await (
    await db()
  ).query<{ id: number; token_version: number }>(
    `INSERT INTO users (email, password_hash, display_name, role, is_author, premium_until)
     VALUES ($1, 'sin-uso', $2, $3, $4, CASE WHEN $5::boolean THEN now() + interval '30 days' END)
     RETURNING id, token_version`,
    [`${kind}-${RUN}-${users}@lectura.test`, `${kind} ${RUN}`, kind === 'admin' ? 'admin' : 'user', kind === 'author', kind === 'premium'],
  );
  const { signSession } = await import('../../modules/auth/auth.service.js');
  const user = rows[0]!;
  return { id: user.id, cookie: `${SESSION_COOKIE}=${signSession({ id: user.id, tokenVersion: user.token_version })}` };
}

export interface ChapterSpec {
  number: number;
  status?: 'approved' | 'pending' | 'draft' | 'rejected';
  withdrawn?: boolean; // publicado y retirado
  title?: string;
  panels?: number; // viñetas (por defecto 2)
}

export interface ComicSpec {
  name: string; // slug = c<RUN>-<name>
  title?: string; // por defecto "Obra <name>"
  status?: 'approved' | 'pending';
  withdrawn?: boolean;
  authorId?: number;
  contentWarning?: string | null;
  coverKey?: string | null;
  chapters?: ChapterSpec[];
}

export interface TestComic {
  id: number;
  slug: string;
  chapterIds: Map<string, number>; // "<número>" o "<número>:<estado>[:retirado]" → id
  panelKeys: Map<number, string[]>; // id del capítulo → claves de sus viñetas, por posición
}

export async function createComic(spec: ComicSpec): Promise<TestComic> {
  const pool = await db();
  const slug = `c${RUN}-${spec.name}`;
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO comics (slug, title, synopsis, author_id, authorship_declared, author_credit, license, license_url,
                         content_warning, cover_key, status, deleted_at)
     VALUES ($1, $2, 'Sinopsis de prueba', $3::int, $3::int IS NOT NULL, 'Autoría original', 'CC BY 4.0',
             'https://creativecommons.org/licenses/by/4.0/', $4, $5, $6, CASE WHEN $7::boolean THEN now() END)
     RETURNING id`,
    [slug, spec.title ?? `Obra ${spec.name}`, spec.authorId ?? null, spec.contentWarning ?? null, spec.coverKey ?? null, spec.status ?? 'approved', spec.withdrawn ?? false],
  );
  const comic: TestComic = { id: rows[0]!.id, slug, chapterIds: new Map(), panelKeys: new Map() };
  for (const chapter of spec.chapters ?? []) {
    const status = chapter.status ?? 'approved';
    const published = status === 'approved';
    const { rows: inserted } = await pool.query<{ id: number }>(
      `INSERT INTO chapters (comic_id, number, title, status, rejection_reason, published_at, deleted_at)
       VALUES ($1, $2::int, $3, $4::text, CASE WHEN $4::text = 'rejected' THEN 'Motivo' END,
               CASE WHEN $5::boolean THEN '2026-11-01T10:00:00Z'::timestamptz + make_interval(days => $2::int) END,
               CASE WHEN $6::boolean THEN now() END)
       RETURNING id`,
      [comic.id, chapter.number, chapter.title ?? `Capítulo ${chapter.number}`, status, published, chapter.withdrawn ?? false],
    );
    const chapterId = inserted[0]!.id;
    const key = chapter.status || chapter.withdrawn ? `${chapter.number}:${status}${chapter.withdrawn ? ':retirado' : ''}` : String(chapter.number);
    comic.chapterIds.set(key, chapterId);
    const keys = Array.from({ length: chapter.panels ?? 2 }, () => newImageKey('webp'));
    comic.panelKeys.set(chapterId, keys);
    await pool.query(
      `INSERT INTO panels (chapter_id, position, image_key, width, height)
       SELECT $1, ordinality, key, 800, 1000 + ordinality FROM unnest($2::text[]) WITH ORDINALITY AS p(key, ordinality)`,
      [chapterId, keys],
    );
  }
  return comic;
}

// Primera lectura ya registrada (chapter_reads), como la dejará la lectura del bloque (T11b).
export async function markRead(userId: number, chapterId: number): Promise<void> {
  await (await db()).query('INSERT INTO chapter_reads (user_id, chapter_id) VALUES ($1, $2)', [userId, chapterId]);
}
