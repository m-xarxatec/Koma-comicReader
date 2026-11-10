import { AppError } from '../../utils/app-error.js';
import { addReads, type Reads } from '../comics/comics.rules.js';

// Reglas puras de la aprobación de contenido (CU-32; RN-05, RN-17; contrato del bloque 4). Devuelven el error que
// toca o null; el servicio las aplica con las filas bloqueadas. Sin BD ni `env`: las prueban los tests unitarios.

export type ReviewDecision = 'approve' | 'reject';

export interface ComicReviewInput {
  status: 'pending' | 'approved' | 'rejected';
  isAdult: boolean;
  deletedAt: Date | null;
}

export interface ChapterReviewInput {
  status: 'draft' | 'pending' | 'approved' | 'rejected'; // 'rejected': ya no es el vivo, pero se responde 409, no 404
}

const comicGone = () => new AppError(410, 'GONE', 'La obra se ha retirado');
const notPending = (what: string) => new AppError(409, 'CONFLICT', `${what} no está pendiente de revisión`);

// Obra: 410 (retirada), 409 (no está pending) y, al aprobar, 409 si está marcada +18 (RN-17: en el MVP se rechaza).
export function comicReviewProblem(comic: ComicReviewInput, decision: ReviewDecision): AppError | null {
  if (comic.deletedAt) return comicGone();
  if (comic.status !== 'pending') return notPending('La obra');
  if (decision === 'approve' && comic.isAdult) return new AppError(409, 'CONFLICT', 'Las obras +18 no se pueden aprobar en el MVP');
  return null;
}

// Capítulo (el vivo de ese número): 410 si su obra se retiró, 409 si la obra está rechazada (D2) o si el capítulo no
// está pending (los borradores no le llegan al admin). Con la obra en pending se puede aprobar: se hace público
// cuando se apruebe la obra.
export function chapterReviewProblem(comic: ComicReviewInput, chapter: ChapterReviewInput): AppError | null {
  if (comic.deletedAt) return comicGone();
  if (comic.status === 'rejected') return new AppError(409, 'CONFLICT', 'La obra está rechazada: sus capítulos no se revisan');
  if (chapter.status !== 'pending') return notPending('El capítulo');
  return null;
}

// --- Parámetros de lectura (CU-36; RN-16) ---

export interface ReadingSettingsValues {
  waitMinutes: number;
  maxBalance: number;
  refill: number;
}

// Lo que cambia entre los valores guardados (en bruto, de la BD: pueden faltar) y los nuevos, ya validados. null =
// nada que guardar ni auditar. before/after, solo con las claves que cambian (settings.update).
export function settingsChange(
  current: Partial<Record<keyof ReadingSettingsValues, unknown>>,
  input: ReadingSettingsValues,
): { before: Partial<Record<keyof ReadingSettingsValues, unknown>>; after: Partial<ReadingSettingsValues> } | null {
  const before: Partial<Record<keyof ReadingSettingsValues, unknown>> = {};
  const after: Partial<ReadingSettingsValues> = {};
  for (const field of ['waitMinutes', 'maxBalance', 'refill'] as const) {
    if (current[field] === input[field]) continue;
    before[field] = current[field] ?? null;
    after[field] = input[field];
  }
  return Object.keys(after).length > 0 ? { before, after } : null;
}

// --- Estadísticas globales (CU-39; RN-20; contrato del bloque 5) ---

export interface WindowCountsInput {
  total: number;
  lastShort: number; // READS_WINDOW_SHORT_DAYS
  lastLong: number; // READS_WINDOW_LONG_DAYS
}

export interface AdminStatsInput {
  counts: {
    today: string;
    readers: number;
    authors: number;
    admins: number;
    suspended: number;
    premium: number;
    activeLong: number;
    comics: number;
    chapters: number;
    commentsShort: number;
    moderatedShort: number;
    auditRecent: number;
  };
  reads: { guests: WindowCountsInput; users: WindowCountsInput };
  topComics: { slug: string; title: string; reads: WindowCountsInput }[];
}

export interface AdminStatsDto {
  today: string;
  users: { total: number; readers: number; authors: number; admins: number; suspended: number; premium: number; activeLast30: number };
  reads: Reads & { guests: Reads; users: Reads };
  catalog: { comics: number; chapters: number };
  topComics: { slug: string; title: string; reads: Reads }[];
  comments: { last7: number; moderatedLast7: number };
  auditLast24h: number;
}

const toReads = (counts: WindowCountsInput): Reads => ({ total: counts.total, last7: counts.lastShort, last30: counts.lastLong });

// RN-20: cada cuenta cuenta una vez (las activas por su rol y las suspendidas aparte), así que el total es su suma;
// las lecturas son invitados + registrados, campo a campo.
export function buildAdminStats({ counts, reads, topComics }: AdminStatsInput): AdminStatsDto {
  const guests = toReads(reads.guests);
  const users = toReads(reads.users);
  return {
    today: counts.today,
    users: {
      total: counts.readers + counts.authors + counts.admins + counts.suspended,
      readers: counts.readers,
      authors: counts.authors,
      admins: counts.admins,
      suspended: counts.suspended,
      premium: counts.premium,
      activeLast30: counts.activeLong,
    },
    reads: { ...addReads(guests, users), guests, users },
    catalog: { comics: counts.comics, chapters: counts.chapters },
    topComics: topComics.map((comic) => ({ slug: comic.slug, title: comic.title, reads: toReads(comic.reads) })),
    comments: { last7: counts.commentsShort, moderatedLast7: counts.moderatedShort },
    auditLast24h: counts.auditRecent,
  };
}
