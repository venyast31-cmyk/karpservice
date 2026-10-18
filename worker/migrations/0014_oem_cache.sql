CREATE TABLE IF NOT EXISTS oem_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oem_cache_expiry ON oem_cache(expires_at);
