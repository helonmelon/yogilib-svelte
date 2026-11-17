-- Additive: reader onboarding, audit trail, AI usage metering and payments. Preserves all existing rows.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_lang TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
CREATE TABLE IF NOT EXISTS audit_log (id BIGSERIAL PRIMARY KEY,actor_id BIGINT,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,detail JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log(created_at DESC);
CREATE TABLE IF NOT EXISTS ai_requests (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,document_id BIGINT,kind TEXT NOT NULL,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ai_requests_user_day ON ai_requests(user_id,created_at);
CREATE TABLE IF NOT EXISTS payments (id BIGSERIAL PRIMARY KEY,client_ref TEXT UNIQUE NOT NULL,user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,provider TEXT NOT NULL,purpose TEXT NOT NULL DEFAULT 'donation',amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),currency TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',provider_ref TEXT,detail JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref ON payments(provider,provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_created ON payments(created_at DESC);
INSERT INTO yogilib_migrations(name) VALUES('002-growth') ON CONFLICT DO NOTHING;
