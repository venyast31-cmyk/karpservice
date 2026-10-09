CREATE TABLE IF NOT EXISTS analytics_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO analytics_meta(key,value) VALUES('started_at',strftime('%Y-%m-%dT%H:%M:%SZ','now'));
-- Daily, event-specific HMAC identifiers: no phone, name, IP, Apple ID or VIN.
CREATE TABLE IF NOT EXISTS analytics_daily (
  day TEXT NOT NULL,
  event TEXT NOT NULL CHECK(event IN ('apple_login','registration','phone_linked','active','booking')),
  actor_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(day,event,actor_key)
);
