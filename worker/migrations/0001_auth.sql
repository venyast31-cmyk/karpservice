CREATE TABLE IF NOT EXISTS telegram_links (
  phone TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS link_requests (
  token_hash TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  telegram_user_id TEXT,
  chat_id TEXT,
  state TEXT NOT NULL,
  challenge_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_link_requests_telegram
  ON link_requests (telegram_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_otp_phone_created
  ON otp_challenges (phone, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  customer_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  telegram_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires
  ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_hash, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires
  ON rate_limits (expires_at);
