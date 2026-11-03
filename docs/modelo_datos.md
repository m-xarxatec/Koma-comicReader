# Modelo de datos · Koma — plataforma de cómics (especificación para migraciones y seeds)

Fuente de verdad del esquema. El constructor escribe cada migración a partir de este documento. Si difiere de `plan_mvp.md`, manda este documento; si algo no está aquí, se pregunta.
Estado: aprobado el 30-oct-2026.

## Convenciones

- Tablas en plural y `snake_case`. Claves foráneas `<entidad>_id`, booleanos `is_*`, fechas `*_at`.
- Claves primarias `INTEGER GENERATED ALWAYS AS IDENTITY`. Excepciones: `audit_log` usa `BIGINT`; las tablas de clave natural o compuesta no tienen `id`.
- Fechas siempre `TIMESTAMPTZ`. `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` en todas las tablas; `updated_at` solo en las editables, mantenida por el trigger `set_updated_at()`.
- Estados con `TEXT` + `CHECK (... IN (...))`, nunca `ENUM`.
- Borrado lógico (`deleted_at`, `hidden_at`). Las FK sin `ON DELETE` usan el comportamiento por defecto (impide borrar); solo `comic_tags` usa `CASCADE`. Única excepción al borrado lógico: las viñetas de un capítulo en `draft` (ver RN-05).
- Las restricciones de la BD protegen invariantes (unicidad, estados, coherencia entre columnas). Los límites configurables (longitudes de RN-12, máximo de imágenes de RN-10) se validan con zod y no se duplican en `CHECK`. Excepción: `comments.body` (1–500), fijado en el plan.
- Imágenes fuera de la BD: solo se guarda la clave `UUID.ext`. El driver `local` acepta cualquier carpeta montada, NAS incluido, en `STORAGE_LOCAL_DIR`.
- `schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())` la crea `scripts/migrate.ts`, no una migración.

## Migraciones

### 001_users

```sql
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TABLE users (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email              TEXT NOT NULL,
  password_hash      TEXT NOT NULL,
  display_name       TEXT NOT NULL,
  role               TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_author          BOOLEAN NOT NULL DEFAULT false,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  token_version      INTEGER NOT NULL DEFAULT 0,
  premium_until      TIMESTAMPTZ,
  stripe_customer_id TEXT UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_admin_not_author CHECK (NOT (role = 'admin' AND is_author))
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 002_settings

```sql
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER settings_set_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 003_audit_log

```sql
CREATE TABLE audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    INTEGER REFERENCES users(id),            -- NULL = invitado o sistema
  action      TEXT NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  before      JSONB,                                    -- solo campos cambiados
  after       JSONB,
  reverts_id  BIGINT REFERENCES audit_log(id),          -- fase 2
  ip          INET,
  request_id  UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_actor_idx   ON audit_log (actor_id, created_at DESC);
CREATE INDEX audit_log_entity_idx  ON audit_log (entity_type, entity_id);

CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log es de solo inserción';
END $$;
CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
```

### 004_comics_tags

```sql
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
```

El `slug` es único incluso en obras retiradas: la URL queda reservada y responde 410 (RN-06).

### 005_chapters_panels

```sql
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
```

**Medidas de la viñeta:** el ancho y el alto se leen de la cabecera del archivo (JPEG, PNG o WebP, sin dependencias) al importar (RN-18) y al subir (RN-10). El lector los pone en `<img width height>` para reservar el hueco y que la página no salte mientras cargan.

**Viñetas en borrador (RN-05):** solo mientras el capítulo está en `draft`, el autor puede eliminar una viñeta. Es un borrado físico, porque nunca fue pública, y su imagen se borra del almacenamiento. Las posiciones posteriores se recompactan en la misma transacción:

```sql
SET CONSTRAINTS panels_chapter_position_uq DEFERRED;
DELETE FROM panels WHERE id = $1;
UPDATE panels SET position = position - 1 WHERE chapter_id = $2 AND position > $3;
```

La restricción es `DEFERRABLE` porque, si no, el `UPDATE` puede chocar con la unicidad fila a fila. Fuera de `draft`, las viñetas no se tocan. La posición de una viñeta nueva es `max(position) + 1`, calculada con el capítulo bloqueado (`SELECT ... FOR UPDATE`).

### 006_comments

```sql
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
```

Solo se comenta en viñetas de capítulos `approved`; lo comprueba el servicio. El contador por viñeta se calcula sin columna guardada:

```sql
SELECT p.position, count(c.id) AS comments
FROM panels p
LEFT JOIN comments c ON c.panel_id = p.id AND c.hidden_at IS NULL AND c.deleted_at IS NULL
WHERE p.chapter_id = $1
GROUP BY p.position;
```

### 007_reading

```sql
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
```

**Saldo (RN-02):**
- La fila de `reading_credits` se crea en la primera lectura de cualquier capítulo (también de los caps. 1–2, que cuentan para `reads_since_ad`, RN-03), con `balance` = máximo vigente y `period_started_at` NULL; si no existe, el saldo es el máximo vigente. `period_started_at` NULL significa siempre «lleno con el máximo vigente»: si el admin sube el máximo, el saldo lleno sube con él.
- El cálculo de recarga se hace en una función pura y la fila se actualiza con `SELECT ... FOR UPDATE` para evitar dobles consumos simultáneos.

**Estadísticas** (invitados y registrados por separado):
- `user_reads` suma 1 cuando se crea la fila de `chapter_reads`, es decir, en la primera lectura de ese usuario: cuenta lectores registrados únicos.
- `guest_reads` suma 1 cuando un invitado abre un capítulo que no está en su cookie firmada de progreso. Esa cookie guarda como máximo los últimos 50 ids de capítulo contados.
- No se cuentan las lecturas del autor dueño ni del admin.
- `day` es la fecha en `Europe/Madrid`: `(now() AT TIME ZONE 'Europe/Madrid')::date`.
- Suma atómica:

```sql
INSERT INTO chapter_read_counts (chapter_id, day, guest_reads)
VALUES ($1, (now() AT TIME ZONE 'Europe/Madrid')::date, 1)
ON CONFLICT (chapter_id, day) DO UPDATE
  SET guest_reads = chapter_read_counts.guest_reads + 1;
```

Crece como capítulos × días con lecturas, sin una fila por visita. Las vistas de estadísticas son de fase 2; los datos se recogen desde el MVP.

### 008_ads

```sql
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
```

Un anuncio sin imagen se muestra como tarjeta de texto.

### 009_billing

```sql
CREATE TABLE subscriptions (
  id                       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id                  INTEGER NOT NULL REFERENCES users(id),
  provider                 TEXT NOT NULL CHECK (provider IN ('stripe', 'fake')),
  provider_subscription_id TEXT NOT NULL UNIQUE,        -- 'sub_…' o 'fake_<uuid>'
  status                   TEXT NOT NULL CHECK (status IN ('incomplete', 'incomplete_expired', 'trialing',
                             'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  current_period_end       TIMESTAMPTZ NOT NULL,
  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_user_idx ON subscriptions (user_id);
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payment_events (
  id          TEXT PRIMARY KEY,                         -- id del evento del proveedor
  type        TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()        -- hace de created_at
);
```

`syncSubscription` actualiza `subscriptions` y recalcula `users.premium_until` en la misma transacción. Su valor es el `current_period_end` mayor entre las suscripciones `active` del usuario, o `NULL` si no hay ninguna.

## Consultas clave

Búsqueda combinando etiquetas (Y, RN y CU-01):

```sql
SELECT c.* FROM comics c
WHERE c.status = 'approved' AND c.deleted_at IS NULL
  AND c.id IN (
    SELECT comic_id FROM comic_tags
    WHERE tag_id = ANY($1::int[])
    GROUP BY comic_id
    HAVING count(*) = cardinality($1::int[])
  )
ORDER BY c.created_at DESC;
```

## Seeds

Todo idempotente: ejecutarlo dos veces no duplica nada ni pisa cambios hechos desde el panel. Cada fila creada de verdad (no omitida por `ON CONFLICT`) se audita con la acción `system.seed`: actor `NULL`, `entity_type` = la tabla, `after` = los ids o claves creados (nunca contraseñas ni hashes) y el `request_id` del script.

### Bloque 1 (tras 001–003)

| Qué | Detalle | Conflicto |
|---|---|---|
| `admin@demo.test` | `role = 'admin'`, nombre "Admin Demo" | `ON CONFLICT ((lower(email))) DO NOTHING` |
| `author@demo.test` | `is_author = true`, nombre "Autora Demo" | ídem |
| `premium@demo.test` | Nombre "Lector Premium". Con `PAYMENTS_DRIVER=fake`, `premium_until = now() + 30 días`; con `stripe`, `NULL` | ídem |
| `reader@demo.test` | Nombre "Lector Demo" | ídem |
| `settings` | `reading.wait_minutes = 1` (demo), `reading.max_balance = 5`, `reading.refill = 2` | `ON CONFLICT (key) DO NOTHING` |

Las contraseñas salen de `SEED_*_PASSWORD`. Si falta alguna, el script termina sin crear nada.

### Bloque 2 (tras 004 y 008)

- **Etiquetas base**, con `ON CONFLICT (slug) DO NOTHING`:
  - `genre`: fantasia, aventura, comedia, drama, horror, misterio, romance, ciencia-ficcion.
  - `theme`: magia, psicologico, sobrenatural, slice-of-life.
- **Tres anuncios de marcas inventadas**, solo texto. Se crean solo si `ads` está vacía:
  - "Tinta Eterna": bolígrafos que duran más que tu última racha de dibujo.
  - "Café Página Doble": la taza que aguanta un capítulo entero sin enfriarse.
  - "Gomas Arrepentidas S.A.": borramos tus trazos, no tus recuerdos.
- **Obras:** no van en el seed. Llegan con `npm run content:import` (RN-18), que además actualiza las etiquetas de `content/tags.json` con `ON CONFLICT (slug) DO UPDATE SET name, type`.

### Bloque 4 (tras 009)

- Con `PAYMENTS_DRIVER=fake`, la cuenta premium recibe una suscripción `provider = 'fake'`, `status = 'active'` y `current_period_end = now() + 30 días`, y `premium_until` se recalcula con `syncSubscription`. Desde aquí, el seed ya no escribe `premium_until` directamente.

## Riesgos aceptados

- Al reemplazar un capítulo, sus comentarios quedan en las viñetas antiguas y el nuevo empieza sin comentarios.
- Los borradores descartados, los capítulos rechazados y las obras cuya importación falla dentro de la transacción (RN-18) dejan sus imágenes en el almacenamiento. En fase 2 se puede añadir un script de limpieza de claves sin referencia.
- Un invitado que borra sus cookies vuelve a sumar en `guest_reads`.
- Releer un capítulo que reemplazó a otro (nuevo `chapter_id`) vuelve a consumir saldo.
- Logout sin revocación: cerrar sesión borra la cookie, pero el JWT no se revoca en el servidor (no hay tabla de sesiones). Un token robado sigue valiendo hasta que caduca (7 días) o hasta que cambia `token_version` (contraseña, rol o estado, RN-15).

## Estado que vive en el navegador (sin tablas)

Lo que es preferencia o comodidad de la interfaz se guarda en `localStorage`; los permisos, el saldo y los límites, siempre en el servidor.

- Advertencias aceptadas por obra (RN-08): lista de slugs. El aviso se repite una vez por dispositivo.
- Ocultar los iconos de comentarios (idea 4).
- Todo acceso a `localStorage` va envuelto en `try/catch`: si falla, la página funciona igual y vuelve a preguntar.

## Fase 3 (no crear)

Las ilustraciones y los retos se añaden sin tocar nada de lo anterior:

- `challenges (id, title, theme, starts_at, ends_at)`
- `illustrations (id, user_id, challenge_id NULL, image_key, title, hidden_at, deleted_at)`
- `illustration_comments (id, illustration_id, user_id, body, hidden_at, deleted_at)`: tabla propia, sin relaciones polimórficas.
