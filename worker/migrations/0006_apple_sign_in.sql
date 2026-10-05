CREATE TABLE IF NOT EXISTS apple_accounts (
  subject_hash TEXT PRIMARY KEY,
  customer_id INTEGER UNIQUE,
  customer_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  refresh_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  validated_at INTEGER NOT NULL,
  disabled_at INTEGER,
  crm_creation_started_at INTEGER
);

CREATE TABLE IF NOT EXISTS apple_challenges (
  id TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  link_session_hash TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apple_challenges_expiry ON apple_challenges(expires_at);

CREATE TABLE IF NOT EXISTS apple_sessions (
  token_hash TEXT PRIMARY KEY,
  subject_hash TEXT NOT NULL REFERENCES apple_accounts(subject_hash) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apple_sessions_subject ON apple_sessions(subject_hash);
CREATE INDEX IF NOT EXISTS idx_apple_sessions_expiry ON apple_sessions(expires_at);
