-- 008_ads · copiada de docs/modelo_datos.md (fuente de verdad del esquema).
-- Marcas inventadas; un anuncio sin imagen se muestra como tarjeta de texto.

CREATE TABLE ads (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand      TEXT NOT NULL,                             -- marca inventada
  body       TEXT NOT NULL,                             -- antes "text" en el plan
  image_key  TEXT CHECK (image_key ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),  -- opcional
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER ads_set_updated_at BEFORE UPDATE ON ads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
