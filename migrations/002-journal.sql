-- Additive: append-only, hash-chained journal of archive changes. Nothing existing is altered.
-- entry and snapshot are stored as exact JSON text so the hash chain can be re-verified byte for byte.
CREATE TABLE IF NOT EXISTS archive_journal (seq BIGSERIAL PRIMARY KEY,at TEXT NOT NULL,action TEXT NOT NULL,document_id BIGINT,actor BIGINT,entry TEXT NOT NULL,snapshot TEXT,prev_hash TEXT NOT NULL,hash TEXT NOT NULL UNIQUE);
CREATE INDEX IF NOT EXISTS archive_journal_document ON archive_journal(document_id,seq);
INSERT INTO yogilib_migrations(name) VALUES('002-journal') ON CONFLICT DO NOTHING;
