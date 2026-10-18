-- Separate namespaces: these identities never reference CRM customers or Telegram links.
CREATE TABLE review_accounts (
  phone TEXT PRIMARY KEY,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  state_json TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE review_sessions (
  token_hash TEXT PRIMARY KEY,
  phone TEXT NOT NULL REFERENCES review_accounts(phone),
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_review_sessions_expiry ON review_sessions(expires_at);
