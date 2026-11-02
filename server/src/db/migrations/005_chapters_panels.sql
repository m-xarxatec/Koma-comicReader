-- 005_chapters_panels · copiada de docs/modelo_datos.md (fuente de verdad del esquema).
-- width y height de cada viñeta se leen de la cabecera del archivo al importar (RN-18) y al subir (RN-10).
-- panels_chapter_position_uq es DEFERRABLE para recompactar posiciones al borrar viñetas de un borrador (RN-05).

CREATE TABLE chapters (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  comic_id         INTEGER NOT NULL REFERENCES comics(id),
  number           INTEGER NOT NULL CHECK (number >= 1),
  title            TEXT NOT NULL,                       -- por defecto "Capítulo N" (lo pone la app)
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  published_at     TIMESTAMPTZ,                         -- se fija al aprobar
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chapters_rejection_reason CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
  CONSTRAINT chapters_published CHECK (status <> 'approved' OR published_at IS NOT NULL)
);
CREATE UNIQUE INDEX chapters_comic_number_uq ON chapters (comic_id, number)
  WHERE deleted_at IS NULL AND status <> 'rejected';     -- RN-09: el reemplazo hereda el número
CREATE INDEX chapters_comic_idx ON chapters (comic_id);
CREATE TRIGGER chapters_set_updated_at BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE panels (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id),
  position   INTEGER NOT NULL CHECK (position >= 1),
  image_key  TEXT NOT NULL UNIQUE CHECK (image_key ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  width      INTEGER NOT NULL CHECK (width > 0),        -- px, leídos de la cabecera del archivo
  height     INTEGER NOT NULL CHECK (height > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT panels_chapter_position_uq UNIQUE (chapter_id, position) DEFERRABLE INITIALLY IMMEDIATE
);
