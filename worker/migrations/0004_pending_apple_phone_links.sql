CREATE TABLE IF NOT EXISTS pending_apple_phone_links (
  challenge_id TEXT PRIMARY KEY,
  apple_sub TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pending_apple_phone_links_apple
  ON pending_apple_phone_links (apple_sub, created_at DESC);
