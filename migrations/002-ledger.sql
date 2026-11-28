-- Additive: append-only, hash-chained archive event log ("the ledger").
-- Every archive mutation records one event whose hash covers the previous event's hash,
-- so the full history can be verified, exported and replayed. Rows are never updated or deleted.
CREATE TABLE IF NOT EXISTS archive_events (seq BIGINT PRIMARY KEY,prev_hash TEXT NOT NULL,hash TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,actor_id TEXT NOT NULL,document_id TEXT,payload JSONB NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS archive_events_document ON archive_events(document_id,seq);
INSERT INTO yogilib_migrations(name) VALUES('002-ledger') ON CONFLICT DO NOTHING
