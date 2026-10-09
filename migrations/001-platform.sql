-- Additive schema update that preserves existing archive data. Explicit migration only on external Postgres.
CREATE TABLE IF NOT EXISTS documents (
 id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, title_np TEXT, category TEXT,
 description TEXT, body_html TEXT, body_text TEXT, lang TEXT, script TEXT,
 orig_author TEXT, orig_author_np TEXT, orig_year TEXT, orig_month TEXT, orig_day TEXT,
 file_path TEXT, uploaded_by BIGINT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'viewer');
CREATE TABLE IF NOT EXISTS document_notes (id BIGSERIAL PRIMARY KEY,document_id BIGINT NOT NULL,user_id BIGINT NOT NULL,quote TEXT NOT NULL,note TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE document_notes ADD COLUMN IF NOT EXISTS client_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS note_client_key ON document_notes(document_id,user_id,client_key);
CREATE TABLE IF NOT EXISTS document_revisions (id BIGSERIAL PRIMARY KEY,document_id BIGINT NOT NULL,snapshot JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app_sessions (token_hash TEXT PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id),expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS app_sessions_expiry ON app_sessions(expires_at);
CREATE TABLE IF NOT EXISTS reading_progress (user_id BIGINT NOT NULL REFERENCES users(id),document_id BIGINT NOT NULL REFERENCES documents(id),position DOUBLE PRECISION NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(user_id,document_id));
CREATE INDEX IF NOT EXISTS documents_search_idx ON documents USING GIN(to_tsvector('simple', COALESCE(title,'')||' '||COALESCE(title_np,'')||' '||COALESCE(description,'')||' '||COALESCE(body_text,'')));
CREATE TABLE IF NOT EXISTS yogilib_migrations (name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO yogilib_migrations(name) VALUES('001-platform') ON CONFLICT DO NOTHING;
