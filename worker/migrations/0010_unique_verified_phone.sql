CREATE UNIQUE INDEX IF NOT EXISTS apple_accounts_verified_phone
ON apple_accounts(phone) WHERE phone <> '' AND disabled_at IS NULL;
