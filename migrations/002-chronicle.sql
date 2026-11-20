-- Additive: an append-only, hash-chained log of every archive change (the "chronicle").
-- Each row commits to the previous row's hash, so any edit, deletion or reordering of history is detectable.
-- Explicit migration only on external Postgres. Nothing existing is altered or removed.
CREATE TABLE IF NOT EXISTS archive_events (seq BIGSERIAL PRIMARY KEY,at TEXT NOT NULL,actor BIGINT,kind TEXT NOT NULL,document_id BIGINT,payload JSONB NOT NULL DEFAULT '{}'::jsonb,prev_hash TEXT NOT NULL,hash TEXT NOT NULL UNIQUE);
CREATE UNIQUE INDEX IF NOT EXISTS archive_events_prev ON archive_events(prev_hash);
CREATE INDEX IF NOT EXISTS archive_events_document ON archive_events(document_id,seq);
INSERT INTO yogilib_migrations(name) VALUES('002-chronicle') ON CONFLICT DO NOTHING;
