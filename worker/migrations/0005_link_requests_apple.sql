ALTER TABLE link_requests ADD COLUMN apple_sub TEXT;
CREATE INDEX IF NOT EXISTS idx_link_requests_apple
  ON link_requests (apple_sub, created_at DESC);
