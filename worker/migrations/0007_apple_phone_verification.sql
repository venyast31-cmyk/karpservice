CREATE TABLE IF NOT EXISTS apple_phone_verifications (
  proof_id TEXT PRIMARY KEY,
  subject_hash TEXT NOT NULL REFERENCES apple_accounts(subject_hash) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apple_phone_proof_expiry ON apple_phone_verifications(expires_at);
