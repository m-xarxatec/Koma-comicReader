-- 004_comics_tags · copiada de docs/modelo_datos.md (fuente de verdad del esquema).
-- El slug es único incluso en obras retiradas: la URL queda reservada y responde 410 (RN-06).

CREATE TABLE comics (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               TEXT NOT NULL,
  synopsis            TEXT NOT NULL,
  author_id           INTEGER REFERENCES users(id),     -- NULL = importada (RN-18)
  author_credit       TEXT NOT NULL,                    -- autor original (RN-07)
  license             TEXT NOT NULL,
  license_url         TEXT,
  authorship_declared BOOLEAN NOT NULL DEFAULT false,
  is_adult            BOOLEAN NOT NULL DEFAULT false,
  content_warning     TEXT,
  cover_key           TEXT CHECK (cover_key ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason    TEXT,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT comics_rejection_reason CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
  CONSTRAINT comics_authorship CHECK (author_id IS NULL OR authorship_declared),
  CONSTRAINT comics_adult_not_approved CHECK (NOT (is_adult AND status = 'approved'))  -- RN-17, se quita en fase 3
);
CREATE INDEX comics_author_idx ON comics (author_id);
CREATE INDEX comics_public_idx ON comics (created_at DESC)
  WHERE status = 'approved' AND deleted_at IS NULL;
CREATE TRIGGER comics_set_updated_at BEFORE UPDATE ON comics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tags (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('genre', 'theme')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE comic_tags (
  comic_id   INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comic_id, tag_id)
);
CREATE INDEX comic_tags_tag_idx ON comic_tags (tag_id);
