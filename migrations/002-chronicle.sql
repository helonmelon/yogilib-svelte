-- Additive: the archive chronicle, an append-only, hash-chained log of every archive change.
-- Each entry commits to the one before it, so history cannot be silently rewritten.
-- Payloads are stored as the exact canonical JSON text that was hashed.
CREATE TABLE IF NOT EXISTS archive_chronicle (
 seq BIGINT PRIMARY KEY, at TEXT NOT NULL, actor_id BIGINT, kind TEXT NOT NULL,
 document_id BIGINT, payload TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS archive_chronicle_document ON archive_chronicle(document_id, seq);
INSERT INTO yogilib_migrations(name) VALUES('002-chronicle') ON CONFLICT DO NOTHING;
