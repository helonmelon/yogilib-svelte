-- Additive: append-only, hash-chained archive event log ("ledger").
-- Every document creation, edit, restore and deletion is recorded so the archive's
-- history can be audited and replayed. Rows are never updated or deleted by the app.
CREATE TABLE IF NOT EXISTS archive_events (seq BIGSERIAL PRIMARY KEY,kind TEXT NOT NULL,document_id BIGINT,actor_id BIGINT,payload JSONB NOT NULL,prev_hash TEXT NOT NULL,hash TEXT NOT NULL UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS archive_events_document ON archive_events(document_id,seq);
INSERT INTO yogilib_migrations(name) VALUES('002-ledger') ON CONFLICT DO NOTHING;
