// Valores numéricos fijos del plan, en un solo sitio (CLAUDE.md: "nunca dispersos"). Los configurables
// desde el panel viven en `settings` (RN-16); los de despliegue, en el entorno (config/env.ts).
// El cliente que necesite alguno lo duplica de forma explícita (tests/unit/client-parity.test.ts).

// RN-10: subidas e importación.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PANELS_PER_CHAPTER = 60;

// RN-01: lectura por número de capítulo y token del anuncio del invitado (contrato del bloque 2).
export const FREE_CHAPTERS = 2; // caps. 1 y 2: libres para todos y sin consumo (RN-01, RN-02)
export const AD_CHAPTER = 3; // el invitado lo lee tras un anuncio
export const AD_TOKEN_MAX_AGE_SECONDS = 30 * 60;

// RN-03: el registrado sin premium ve un anuncio intersticial cada 5 primeras lecturas (reads_since_ad).
export const INTERSTITIAL_EVERY = 5;

// Estadísticas del invitado (modelo_datos.md, "Estadísticas"; decisión D3): cookie firmada con los últimos
// capítulos ya contados.
export const GUEST_READS_MAX = 50;
export const GUEST_READS_COOKIE_DAYS = 30;

// Catálogo (contrato del bloque 2).
export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_QUERY_MAX_LENGTH = 100;
export const CATALOG_MAX_TAGS = 10;
