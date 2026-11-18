-- Additive: append-only, hash-chained archive journal. Never rewrites or deletes existing data.
CREATE TABLE IF NOT EXISTS archive_events (seq BIGSERIAL PRIMARY KEY,kind TEXT NOT NULL,document_id BIGINT,actor_id BIGINT,payload JSONB NOT NULL,at TEXT NOT NULL,prev_hash TEXT NOT NULL,hash TEXT NOT NULL UNIQUE);
CREATE INDEX IF NOT EXISTS archive_events_document ON archive_events(document_id);
INSERT INTO yogilib_migrations(name) VALUES('002-journal') ON CONFLICT DO NOTHING;
