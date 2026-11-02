-- 007_reading · copiada de docs/modelo_datos.md (fuente de verdad del esquema).
-- La 006 (comments) llega en el bloque 3: migrate.ts aplica las pendientes aunque haya huecos.

CREATE TABLE chapter_reads (
  user_id       INTEGER NOT NULL REFERENCES users(id),
  chapter_id    INTEGER NOT NULL REFERENCES chapters(id),
  first_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),     -- hace de created_at
  last_read_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_panel    INTEGER,                                -- fase 2: punto de abandono
  PRIMARY KEY (user_id, chapter_id)
);
CREATE INDEX chapter_reads_chapter_idx ON chapter_reads (chapter_id);

CREATE TABLE reading_credits (
  user_id           INTEGER PRIMARY KEY REFERENCES users(id),
  balance           INTEGER NOT NULL CHECK (balance >= 0),
  period_started_at TIMESTAMPTZ,                        -- NULL = saldo lleno
  reads_since_ad    INTEGER NOT NULL DEFAULT 0 CHECK (reads_since_ad >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER reading_credits_set_updated_at BEFORE UPDATE ON reading_credits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE chapter_read_counts (
  chapter_id  INTEGER NOT NULL REFERENCES chapters(id),
  day         DATE NOT NULL,
  guest_reads INTEGER NOT NULL DEFAULT 0 CHECK (guest_reads >= 0),
  user_reads  INTEGER NOT NULL DEFAULT 0 CHECK (user_reads >= 0),
  PRIMARY KEY (chapter_id, day)
);
