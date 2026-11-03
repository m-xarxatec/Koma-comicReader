import { env } from '../../config/env.js';
import { pool, withTransaction } from '../../db/pool.js';
import { storage } from '../../integrations/storage/index.js';
import { AppError } from '../../utils/app-error.js';
import { deriveKey } from '../../utils/signing.js';
import { chapterAccess, isAdmin, isPremium } from '../auth/permissions.js';
import * as chaptersRepository from '../chapters/chapters.repository.js';
import type { ComicRow } from '../comics/comics.repository.js';
import { requirePublicComic } from '../comics/comics.service.js';
import type { User } from '../users/users.repository.js';
import * as readingRepository from './reading.repository.js';
import {
  addGuestRead,
  buildAdStart,
  consumeCredit,
  createAdToken,
  parseGuestReads,
  recalculateCredits,
  serializeGuestReads,
  toAdDto,
  verifyAdToken,
  type AdDto,
  type AdStartDto,
  type ReadingSettings,
} from './reading.rules.js';

// Anuncio y lectura (CU-03, CU-04, CU-12, CU-24; RN-01 a RN-03; contrato del bloque 2).

// Claves derivadas de COOKIE_SECRET, una por uso: sin variables nuevas.
const adTokenKey = deriveKey(env.COOKIE_SECRET, 'ad-token');
const guestReadsKey = deriveKey(env.COOKIE_SECRET, 'guest-reads');

const signUrl = (key: string) => storage.signedUrl(key);

// GET /api/comics/:slug/ad (RN-01): el anuncio que ve el invitado antes del cap. 3 y el token que lo
// demuestra, firmado con la obra y la hora de inicio. No guarda nada.
export async function startAd(slug: string): Promise<AdStartDto> {
  const comic = await requirePublicComic(slug);
  const ad = await readingRepository.pickActiveAd(pool);
  return buildAdStart(ad, createAdToken(adTokenKey, comic.id, new Date()), env.AD_MIN_SECONDS, signUrl);
}

// --- Lectura (POST /api/comics/:slug/chapters/:number/read) ---

export interface BalanceDto {
  balance: number;
  max: number;
  retryAt: string | null; // próxima recarga (ISO 8601); null con el saldo lleno
}

export interface ReadingDto {
  comic: { slug: string; title: string; contentWarning: string | null };
  chapter: { number: number; title: string; prev: number | null; next: number | null };
  panels: { position: number; url: string; width: number; height: number }[]; // la viñeta n es #v-n (RN-09)
  ads: { interstitial: AdDto | null; end: AdDto | null }; // RN-03; los dos null para invitado, premium y admin
  balance: BalanceDto | null; // solo registrado sin premium
}

export interface ReadResult {
  reading: ReadingDto;
  guestReadsCookie: string | null; // nuevo valor de koma_guest_reads (solo invitado, si se contó la lectura)
}

// Parámetros de RN-16 vigentes. Sin ellos (seed sin ejecutar) no se puede calcular el saldo: 500.
async function loadReadingSettings(): Promise<ReadingSettings> {
  const values = await readingRepository.findReadingSettings(pool);
  const positive = (key: readingRepository.ReadingSettingKey): number => {
    const value = values[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error(`Parámetro de lectura ausente o no válido en settings: ${key}`);
    return value;
  };
  return { maxBalance: positive('reading.max_balance'), refill: positive('reading.refill'), waitMinutes: positive('reading.wait_minutes') };
}

async function buildReading(comic: ComicRow, chapter: chaptersRepository.ChapterRow, extra: Pick<ReadingDto, 'ads' | 'balance'>): Promise<ReadingDto> {
  const adjacent = await chaptersRepository.findAdjacentNumbers(pool, comic.id, chapter.number);
  const panels = await chaptersRepository.listPanels(pool, chapter.id);
  return {
    comic: { slug: comic.slug, title: comic.title, contentWarning: comic.contentWarning },
    chapter: { number: chapter.number, title: chapter.title, prev: adjacent.prev, next: adjacent.next },
    panels: await Promise.all(
      panels.map(async (panel) => ({ position: panel.position, url: await signUrl(panel.imageKey), width: panel.width, height: panel.height })),
    ),
    ...extra,
  };
}

// Decide si quien pide el capítulo puede leerlo, en el orden del contrato: 1) obra y capítulo públicos
// (404, 410); 2) admin y premium siempre; 3) caps. 1–2 libres; 4) invitado: el cap. 3 con un X-Ad-Token
// válido (403 AD_NOT_COMPLETED) y del 4 en adelante 401 UNAUTHENTICATED; 5) registrado: si ya lo leyó no
// consume y, si no, gasta 1 del saldo recalculado (403 READING_LIMIT con retryAt). Repetir la petición
// ("Recargar", CU-03) da URLs firmadas nuevas sin volver a consumir.
export async function readChapter(
  slug: string,
  number: number,
  user: User | null,
  input: { adToken: string | undefined; guestReadsCookie: unknown },
): Promise<ReadResult> {
  const comic = await requirePublicComic(slug);
  const chapter = await chaptersRepository.findChapterForReading(pool, comic.id, number);
  if (!chapter) throw new AppError(404, 'NOT_FOUND', 'El capítulo no existe');
  if (chapter.withdrawn) throw new AppError(410, 'GONE', 'El capítulo se ha retirado');
  const now = new Date();
  return user ? readAsUser(comic, chapter, user, now) : readAsGuest(comic, chapter, input, now);
}

async function readAsGuest(
  comic: ComicRow,
  chapter: chaptersRepository.ChapterRow,
  input: { adToken: string | undefined; guestReadsCookie: unknown },
  now: Date,
): Promise<ReadResult> {
  const access = chapterAccess(null, { number: chapter.number, alreadyRead: false, ownsComic: false }, now);
  if (access === 'account') throw new AppError(401, 'UNAUTHENTICATED', 'Crea una cuenta gratis o entra para seguir leyendo');
  if (access === 'ad' && verifyAdToken(adTokenKey, input.adToken, comic.id, now, env.AD_MIN_SECONDS) !== 'valid') {
    throw new AppError(403, 'AD_NOT_COMPLETED', 'Mira el anuncio hasta el final para leer este capítulo');
  }

  // guest_reads: una vez por capítulo y navegador, según la cookie firmada (sin datos personales).
  const counted = parseGuestReads(guestReadsKey, input.guestReadsCookie);
  let guestReadsCookie: string | null = null;
  if (!counted.includes(chapter.id)) {
    await readingRepository.countRead(pool, chapter.id, 'guest');
    guestReadsCookie = serializeGuestReads(guestReadsKey, addGuestRead(counted, chapter.id));
  }
  const reading = await buildReading(comic, chapter, { ads: { interstitial: null, end: null }, balance: null });
  return { reading, guestReadsCookie };
}

async function readAsUser(comic: ComicRow, chapter: chaptersRepository.ChapterRow, user: User, now: Date): Promise<ReadResult> {
  const ownsComic = comic.authorId === user.id;
  // Saldo y anuncios: solo el registrado sin premium (también un autor, en su obra o en otra). RN-03.
  const settings = isAdmin(user) || isPremium(user, now) ? null : await loadReadingSettings();

  // Una transacción: saldo, chapter_reads, reads_since_ad y estadísticas; un error lo deshace todo.
  const balance = await withTransaction(async (client): Promise<BalanceDto | null> => {
    const stored = settings ? await readingRepository.lockCredits(client, user.id, settings.maxBalance) : null;
    const alreadyRead = (await readingRepository.findReadChapterIds(client, user.id, [chapter.id])).has(chapter.id);
    const access = chapterAccess(user, { number: chapter.number, alreadyRead, ownsComic }, now);

    let credits = settings ? recalculateCredits(stored, settings, now) : null;
    if (access === 'balance') {
      if (!settings || !credits) throw new Error('Saldo sin parámetros de lectura'); // chapterAccess lo impide
      const consumed = consumeCredit(credits, settings, now);
      if (!consumed) {
        throw new AppError(403, 'READING_LIMIT', 'Has gastado tu saldo de capítulos: se recarga en unos minutos', {
          ...(credits.retryAt && { retryAt: credits.retryAt }),
        });
      }
      credits = consumed;
      await readingRepository.updateCredits(client, user.id, consumed);
    }

    const firstRead = await readingRepository.recordChapterRead(client, user.id, chapter.id);
    if (firstRead && settings) await readingRepository.incrementReadsSinceAd(client, user.id);
    // user_reads: lectores registrados únicos; no cuentan el admin ni el autor dueño.
    if (firstRead && !isAdmin(user) && !ownsComic) await readingRepository.countRead(client, chapter.id, 'user');

    return settings && credits
      ? { balance: credits.balance, max: settings.maxBalance, retryAt: credits.retryAt ? credits.retryAt.toISOString() : null }
      : null;
  });

  // RN-03: anuncio al final de cada capítulo para el registrado sin premium. El intersticial llega en T17.
  const endAd = settings ? await readingRepository.pickActiveAd(pool) : null;
  const reading = await buildReading(comic, chapter, {
    ads: { interstitial: null, end: endAd ? await toAdDto(endAd, signUrl) : null },
    balance,
  });
  return { reading, guestReadsCookie: null };
}
