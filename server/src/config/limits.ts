// Valores numéricos fijos del plan, en un solo sitio (CLAUDE.md: "nunca dispersos"). Los configurables
// desde el panel viven en `settings` (RN-16); los de despliegue, en el entorno (config/env.ts).
// El cliente que necesite alguno lo duplica de forma explícita (tests/unit/client-parity.test.ts).

// Mayor valor de un INTEGER de PostgreSQL: números de capítulo y medidas de viñeta (rutas, importación y subidas).
export const PG_MAX_INT = 2_147_483_647;

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

// Textos del bloque 3 (contrato, D5), en puntos de código y sin espacios en los extremos (utils/text.ts).
export const COMIC_TITLE_MAX = 100;
export const COMIC_SYNOPSIS_MAX = 1000;
export const AUTHOR_CREDIT_MAX = 100;
export const CONTENT_WARNING_MAX = 200;
export const CHAPTER_TITLE_MAX = 100;
export const COMIC_TAGS_MAX = 10; // de 1 a 10, con al menos una de tipo genre
export const SLUG_MAX_LENGTH = 80; // antes del sufijo -2, -3… (RN-09)

// RN-11: comentarios por viñeta (el CHECK de 006 repite el máximo).
export const COMMENT_BODY_MAX = 500;
export const COMMENTS_PAGE_SIZE = 50;

// RN-19: panel del autor (contrato del bloque 3, "Panel del autor"). Ventanas con hoy incluido.
export const READS_WINDOW_SHORT_DAYS = 7;
export const READS_WINDOW_LONG_DAYS = 30;
export const AUTHOR_RECENT_COMMENTS = 10;

// RN-04: pago simulado (driver fake) y seed de la cuenta premium (contrato del bloque 4).
export const FAKE_PREMIUM_DAYS = 30;
