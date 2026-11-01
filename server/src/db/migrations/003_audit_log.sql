-- 003_audit_log · copiada de docs/modelo_datos.md (fuente de verdad del esquema).
-- Solo inserción: los triggers bloquean UPDATE, DELETE y TRUNCATE.

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
