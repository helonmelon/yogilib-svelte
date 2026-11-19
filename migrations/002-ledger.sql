-- Additive: append-only, hash-chained journal of shared archive changes.
-- Nothing is rewritten or removed, and existing tables are untouched. Explicit migration only on external Postgres.
CREATE TABLE IF NOT EXISTS archive_events (seq BIGSERIAL PRIMARY KEY,at TEXT NOT NULL,actor BIGINT,kind TEXT NOT NULL,document_id BIGINT,payload JSONB NOT NULL,prev_hash TEXT NOT NULL,hash TEXT NOT NULL UNIQUE);
CREATE INDEX IF NOT EXISTS archive_events_document ON archive_events(document_id,seq);
INSERT INTO yogilib_migrations(name) VALUES('002-ledger') ON CONFLICT DO NOTHING;
