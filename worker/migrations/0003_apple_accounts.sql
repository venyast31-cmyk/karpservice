CREATE TABLE IF NOT EXISTS apple_accounts (
  apple_sub TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT UNIQUE,
  customer_id INTEGER,
  phone_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apple_accounts_phone
  ON apple_accounts (phone);

ALTER TABLE sessions ADD COLUMN apple_sub TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_apple_sub
  ON sessions (apple_sub);
