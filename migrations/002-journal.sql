-- Additive: append-only, hash-chained archive journal. Nothing here alters or removes existing rows.
-- Every create, edit, restore and deletion of a document is recorded with the full snapshot it produced or removed,
-- so the archive can be audited, replayed and recovered. Explicit migration only on external Postgres.
CREATE TABLE IF NOT EXISTS archive_events (id BIGSERIAL PRIMARY KEY,at TIMESTAMPTZ NOT NULL DEFAULT now(),actor_id BIGINT,kind TEXT NOT NULL,document_id BIGINT,payload JSONB NOT NULL,prev_hash TEXT NOT NULL,hash TEXT NOT NULL UNIQUE);
CREATE INDEX IF NOT EXISTS archive_events_document ON archive_events(document_id,id);
INSERT INTO yogilib_migrations(name) VALUES('002-journal') ON CONFLICT DO NOTHING;
