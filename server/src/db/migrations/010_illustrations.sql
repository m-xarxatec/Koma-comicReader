-- Bloque 6: ilustraciones de la comunidad (RN-22; docs/modelo_datos.md, 010_illustrations).
CREATE TABLE illustrations (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  title            TEXT NOT NULL,
  description      TEXT,
  image_key        TEXT NOT NULL UNIQUE CHECK (image_key ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  width            INTEGER NOT NULL CHECK (width > 0),      -- px, leídos de la cabecera del archivo
  height           INTEGER NOT NULL CHECK (height > 0),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  published_at     TIMESTAMPTZ,                             -- se fija al aprobar
  deleted_at       TIMESTAMPTZ,                             -- retirada (dueño o admin)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT illustrations_rejection_reason CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
  CONSTRAINT illustrations_published CHECK (status <> 'approved' OR published_at IS NOT NULL)
);
CREATE INDEX illustrations_public_idx ON illustrations (published_at DESC)
  WHERE status = 'approved' AND deleted_at IS NULL;
CREATE INDEX illustrations_user_idx ON illustrations (user_id, created_at DESC);
CREATE TRIGGER illustrations_set_updated_at BEFORE UPDATE ON illustrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE illustration_tags (
  illustration_id INTEGER NOT NULL REFERENCES illustrations(id),
  tag             TEXT NOT NULL CHECK (tag ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),  -- slug normalizado (RN-22)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (illustration_id, tag)
);
CREATE INDEX illustration_tags_tag_idx ON illustration_tags (tag);
