-- Additive: append-only, hash-chained archive ledger. Creates one table and changes no existing rows.
CREATE TABLE IF NOT EXISTS archive_events (seq BIGSERIAL PRIMARY KEY,kind TEXT NOT NULL,document_id BIGINT,actor_id BIGINT,payload JSONB NOT NULL,recorded_at TEXT NOT NULL,prev_hash TEXT NOT NULL,hash TEXT NOT NULL UNIQUE);
CREATE INDEX IF NOT EXISTS archive_events_document ON archive_events(document_id);
INSERT INTO yogilib_migrations(name) VALUES('002-ledger') ON CONFLICT DO NOTHING;
