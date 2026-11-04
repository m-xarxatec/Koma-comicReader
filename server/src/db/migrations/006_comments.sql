-- 006_comments · copiada de docs/modelo_datos.md (fuente de verdad del esquema).
-- Comentarios por viñeta (RN-11): borrado siempre lógico (hidden_at, deleted_at). Llega después de 007 y 008:
-- migrate.ts aplica las pendientes por nombre, no solo las posteriores a la última.

CREATE TABLE comments (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  panel_id   INTEGER NOT NULL REFERENCES panels(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  hidden_at  TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comments_panel_idx ON comments (panel_id, created_at);
CREATE INDEX comments_user_idx  ON comments (user_id);
