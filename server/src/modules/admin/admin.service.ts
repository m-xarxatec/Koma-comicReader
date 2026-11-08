import { ADMIN_PAGE_SIZE, REVIEW_QUEUE_MAX } from '../../config/limits.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../utils/app-error.js';
import * as auditRepository from '../audit/audit.repository.js';
import * as audit from '../audit/audit.service.js';
import type { AUDIT_ENTITY_TYPES, AuditAction } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import * as chaptersRepository from '../chapters/chapters.repository.js';
import * as comicsRepository from '../comics/comics.repository.js';
import type { ReadingSettings } from '../reading/reading.rules.js';
import * as readingRepository from '../reading/reading.repository.js';
import { loadReadingSettings } from '../reading/reading.service.js';
import type { User } from '../users/users.repository.js';
import { chapterReviewProblem, comicReviewProblem, settingsChange } from './admin.rules.js';

type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

// Rechazar exige motivo (RN-05): la unión impide llegar aquí sin él.
export type Review = { decision: 'approve' } | { decision: 'reject'; reason: string };

// Aprobación de contenido (CU-32; RN-05, RN-09, RN-17; contrato del bloque 4). requireAdmin va en el router: aquí
// siempre llega un admin. Cambio y auditoría en la misma transacción, con la fila bloqueada.

export interface ReviewItemDto {
  kind: 'comic' | 'chapter';
  comic: {
    slug: string;
    title: string;
    status: 'pending' | 'approved';
    publishedBy: string;
    isAdult: boolean;
    contentWarning: string | null;
  };
  chapter: { number: number; title: string; panelCount: number } | null;
  submittedAt: string; // ISO 8601
}

export interface ReviewQueueDto {
  items: ReviewItemDto[];
  counts: { comics: number; chapters: number };
}

// Obras y capítulos pending (hasta REVIEW_QUEUE_MAX de cada tipo), del envío más antiguo al más reciente.
export async function getReviewQueue(): Promise<ReviewQueueDto> {
  const [comics, chapters] = await Promise.all([
    comicsRepository.listPendingComics(pool, REVIEW_QUEUE_MAX),
    chaptersRepository.listPendingChapters(pool, REVIEW_QUEUE_MAX),
  ]);
  const items: (ReviewItemDto & { at: number })[] = [
    ...comics.comics.map((comic) => ({
      kind: 'comic' as const,
      comic: {
        slug: comic.slug,
        title: comic.title,
        status: 'pending' as const,
        publishedBy: comic.publishedBy,
        isAdult: comic.isAdult,
        contentWarning: comic.contentWarning,
      },
      chapter: null,
      submittedAt: comic.createdAt.toISOString(),
      at: comic.createdAt.getTime(),
    })),
    ...chapters.chapters.map((chapter) => ({
      kind: 'chapter' as const,
      comic: chapter.comic,
      chapter: { number: chapter.number, title: chapter.title, panelCount: chapter.panelCount },
      submittedAt: chapter.submittedAt.toISOString(),
      at: chapter.submittedAt.getTime(),
    })),
  ];
  items.sort((a, b) => a.at - b.at);
  return { items: items.map(({ at: _at, ...item }) => item), counts: { comics: comics.total, chapters: chapters.total } };
}

const comicNotFound = () => new AppError(404, 'NOT_FOUND', 'La obra no existe');

// Aprobar o rechazar una obra pending. Rechazar exige motivo (RN-05), que verá el autor.
export async function reviewComic(admin: User, slug: string, review: Review, ctx: RequestContext): Promise<void> {
  await withTransaction(async (client) => {
    const comic = await comicsRepository.findComicForReview(client, slug);
    if (!comic) throw comicNotFound();
    const problem = comicReviewProblem(comic, review.decision);
    if (problem) throw problem;
    const base = { actorId: admin.id, entityType: 'comics', entityId: String(comic.id), ...ctx };
    if (review.decision === 'approve') {
      await comicsRepository.setComicReview(client, comic.id, 'approved', null);
      await audit.record(client, { ...base, action: 'comic.approve', before: { status: 'pending' }, after: { status: 'approved' } });
    } else {
      await comicsRepository.setComicReview(client, comic.id, 'rejected', review.reason);
      await audit.record(client, {
        ...base,
        action: 'comic.reject',
        before: { status: 'pending', rejectionReason: null },
        after: { status: 'rejected', rejectionReason: review.reason },
      });
    }
  });
}

// Aprobar o rechazar el capítulo vivo de ese número. Aprobar fija published_at; rechazar libera el número (RN-09).
export async function reviewChapter(
  admin: User,
  slug: string,
  number: number,
  review: Review,
  ctx: RequestContext,
): Promise<void> {
  await withTransaction(async (client) => {
    const comic = await comicsRepository.findComicForReview(client, slug);
    if (!comic) throw comicNotFound();
    const chapter = await chaptersRepository.findLiveChapter(client, comic.id, number, true);
    if (!chapter) throw new AppError(404, 'NOT_FOUND', 'El capítulo no existe');
    const problem = chapterReviewProblem(comic, chapter);
    if (problem) throw problem;
    const base = { actorId: admin.id, entityType: 'chapters', entityId: String(chapter.id), ...ctx };
    if (review.decision === 'approve') {
      const publishedAt = await chaptersRepository.approveChapter(client, chapter.id);
      await audit.record(client, {
        ...base,
        action: 'chapter.approve',
        before: { status: 'pending', publishedAt: null },
        after: { status: 'approved', publishedAt: publishedAt.toISOString() },
      });
    } else {
      await chaptersRepository.rejectChapter(client, chapter.id, review.reason);
      await audit.record(client, {
        ...base,
        action: 'chapter.reject',
        before: { status: 'pending', rejectionReason: null },
        after: { status: 'rejected', rejectionReason: review.reason },
      });
    }
  });
}

// --- Parámetros de lectura (CU-36; RN-16) ---

export type ReadingSettingsDto = ReadingSettings; // waitMinutes, maxBalance y refill

const SETTING_KEYS: Readonly<Record<keyof ReadingSettings, readingRepository.ReadingSettingKey>> = {
  waitMinutes: 'reading.wait_minutes',
  maxBalance: 'reading.max_balance',
  refill: 'reading.refill',
};

export async function getReadingSettings(): Promise<ReadingSettingsDto> {
  return loadReadingSettings();
}

// Los tres a la vez (ya validados en su rango). Una entrada settings.update con solo las claves que cambian; sin
// cambios, ni escribe ni audita. La lectura los usa desde la petición siguiente (RN-02, cálculo perezoso).
export async function updateReadingSettings(admin: User, input: ReadingSettings, ctx: RequestContext): Promise<ReadingSettingsDto> {
  return withTransaction(async (client) => {
    const stored = await readingRepository.findReadingSettingsForUpdate(client);
    const fields = Object.keys(SETTING_KEYS) as (keyof ReadingSettings)[];
    const current = Object.fromEntries(fields.map((field) => [field, stored[SETTING_KEYS[field]]]));
    const change = settingsChange(current, input);
    if (change) {
      for (const field of Object.keys(change.after) as (keyof ReadingSettings)[]) {
        await readingRepository.saveSetting(client, SETTING_KEYS[field], input[field]);
      }
      await audit.record(client, { action: 'settings.update', actorId: admin.id, entityType: 'settings', entityId: null, ...change, ...ctx });
    }
    return { ...input };
  });
}

// --- Bloque 4: consulta del admin (CU-40; contrato del bloque 4) ---

export interface AuditEntryDto {
  id: string;
  createdAt: string; // ISO 8601
  actor: { id: number; displayName: string; email: string } | null; // null = invitado o sistema
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown; // JSON tal como se guardó; el cliente lo pinta con textContent
  after: unknown;
  ip: string | null;
  requestId: string;
}

export interface AuditPageDto {
  entries: AuditEntryDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuditQuery {
  actor?: string | undefined;
  action?: AuditAction | undefined;
  entityType?: AuditEntityType | undefined;
  entityId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page: number;
}

// Solo lectura: consultarla no se audita y la restauración es de fase 2.
export async function searchAudit(query: AuditQuery): Promise<AuditPageDto> {
  const { total, entries } = await auditRepository.search(pool, {
    actorEmail: query.actor ?? null,
    action: query.action ?? null,
    entityType: query.entityType ?? null,
    entityId: query.entityId ?? null,
    from: query.from ?? null,
    to: query.to ?? null,
    limit: ADMIN_PAGE_SIZE,
    offset: (query.page - 1) * ADMIN_PAGE_SIZE,
  });
  return {
    entries: entries.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
    page: query.page,
    pageSize: ADMIN_PAGE_SIZE,
    total,
  };
}
