import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { storage } from '../../integrations/storage/index.js';
import { AppError } from '../../utils/app-error.js';
import { deriveKey } from '../../utils/signing.js';
import { chapterAccess } from '../auth/permissions.js';
import * as chaptersRepository from '../chapters/chapters.repository.js';
import { requirePublicComic } from '../comics/comics.service.js';
import type { User } from '../users/users.repository.js';
import * as readingRepository from './reading.repository.js';
import { createAdToken, verifyAdToken } from './reading.rules.js';

// Anuncio y lectura (CU-03, CU-04, CU-12, CU-24; RN-01 a RN-03; contrato del bloque 2).

// Clave del token del anuncio, derivada de COOKIE_SECRET (etiqueta `ad-token`): sin variable nueva.
const adTokenKey = deriveKey(env.COOKIE_SECRET, 'ad-token');

export interface AdDto {
  brand: string;
  body: string;
  imageUrl: string | null; // firmada; null = tarjeta de texto
}

export interface AdStartDto {
  ad: AdDto | null; // null sin anuncios activos: el cap. 3 no se bloquea
  adToken: string;
  minSeconds: number;
}

async function toAdDto(ad: readingRepository.AdRow): Promise<AdDto> {
  return { brand: ad.brand, body: ad.body, imageUrl: ad.imageKey ? await storage.signedUrl(ad.imageKey) : null };
}

// GET /api/comics/:slug/ad (RN-01): el anuncio que ve el invitado antes del cap. 3 y el token que lo
// demuestra, firmado con la obra y la hora de inicio. No guarda nada.
export async function startAd(slug: string): Promise<AdStartDto> {
  const comic = await requirePublicComic(slug);
  const ad = await readingRepository.pickActiveAd(pool);
  return {
    ad: ad ? await toAdDto(ad) : null,
    adToken: createAdToken(adTokenKey, comic.id, new Date()),
    minSeconds: env.AD_MIN_SECONDS,
  };
}

// --- Lectura (POST /api/comics/:slug/chapters/:number/read) ---

export interface ReadingDto {
  comic: { slug: string; title: string; contentWarning: string | null };
  chapter: { number: number; title: string; prev: number | null; next: number | null };
  panels: { position: number; url: string; width: number; height: number }[]; // la viñeta n es #v-n (RN-09)
  ads: { interstitial: AdDto | null; end: AdDto | null }; // RN-03; los dos null para invitado, premium y admin
  balance: { balance: number; max: number; retryAt: string | null } | null; // solo registrado sin premium
}

// Número de capítulo de la URL en forma canónica (sin ceros a la izquierda) y dentro de un INTEGER; si no,
// no puede existir: null (404).
const CHAPTER_NUMBER = /^[1-9]\d{0,9}$/;
const MAX_INT = 2_147_483_647;

function parseChapterNumber(value: string): number | null {
  if (!CHAPTER_NUMBER.test(value)) return null;
  const number = Number(value);
  return number <= MAX_INT ? number : null;
}

// Decide si quien pide el capítulo puede leerlo, en el orden del contrato: 1) obra y capítulo públicos
// (404, 410); 2) admin y premium siempre; 3) caps. 1–2 libres; 4) invitado: el cap. 3 con un X-Ad-Token
// válido (403 AD_NOT_COMPLETED) y del 4 en adelante 401 UNAUTHENTICATED; 5) registrado: saldo (RN-02).
// Repetir la petición ("Recargar", CU-03) da URLs firmadas nuevas.
export async function readChapter(slug: string, numberParam: string, user: User | null, adToken: string | undefined): Promise<ReadingDto> {
  const comic = await requirePublicComic(slug);
  const number = parseChapterNumber(numberParam);
  const chapter = number === null ? null : await chaptersRepository.findChapterForReading(pool, comic.id, number);
  if (!chapter) throw new AppError(404, 'NOT_FOUND', 'El capítulo no existe');
  if (chapter.withdrawn) throw new AppError(410, 'GONE', 'El capítulo se ha retirado');

  const now = new Date();
  const alreadyRead = user ? (await readingRepository.findReadChapterIds(pool, user.id, [chapter.id])).has(chapter.id) : false;
  const access = chapterAccess(user, { number: chapter.number, alreadyRead, ownsComic: user !== null && comic.authorId === user.id }, now);
  switch (access) {
    case 'free':
      break;
    case 'ad':
      if (verifyAdToken(adTokenKey, adToken, comic.id, now, env.AD_MIN_SECONDS) !== 'valid') {
        throw new AppError(403, 'AD_NOT_COMPLETED', 'Mira el anuncio hasta el final para leer este capítulo');
      }
      break;
    case 'account':
      throw new AppError(401, 'UNAUTHENTICATED', 'Crea una cuenta gratis o entra para seguir leyendo');
    case 'balance':
      // T11b: saldo con SELECT … FOR UPDATE, chapter_reads, reading_credits y estadísticas. Hasta entonces
      // responde 500, para que nadie lea sin gastar saldo.
      throw new Error('Lectura con saldo (RN-02): pendiente de T11b');
  }

  const adjacent = await chaptersRepository.findAdjacentNumbers(pool, comic.id, chapter.number);
  const panels = await chaptersRepository.listPanels(pool, chapter.id);
  return {
    comic: { slug: comic.slug, title: comic.title, contentWarning: comic.contentWarning },
    chapter: { number: chapter.number, title: chapter.title, prev: adjacent.prev, next: adjacent.next },
    panels: await Promise.all(
      panels.map(async (panel) => ({ position: panel.position, url: await storage.signedUrl(panel.imageKey), width: panel.width, height: panel.height })),
    ),
    ads: { interstitial: null, end: null }, // RN-03 (anuncio final del registrado): T11b
    balance: null, // RN-02 (saldo del registrado): T11b
  };
}
