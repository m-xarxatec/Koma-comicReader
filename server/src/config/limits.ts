// Valores numéricos fijos del plan, en un solo sitio (CLAUDE.md: "nunca dispersos"). Los configurables
// desde el panel viven en `settings` (RN-16); los de despliegue, en el entorno (config/env.ts).
// El cliente que necesite alguno lo duplica de forma explícita (tests/unit/client-parity.test.ts).

// RN-10: subidas e importación.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PANELS_PER_CHAPTER = 60;

// Catálogo (contrato del bloque 2).
export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_QUERY_MAX_LENGTH = 100;
export const CATALOG_MAX_TAGS = 10;
