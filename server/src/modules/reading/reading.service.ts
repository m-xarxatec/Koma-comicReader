import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { storage } from '../../integrations/storage/index.js';
import { deriveKey } from '../../utils/signing.js';
import { requirePublicComic } from '../comics/comics.service.js';
import * as readingRepository from './reading.repository.js';
import { createAdToken } from './reading.rules.js';

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
