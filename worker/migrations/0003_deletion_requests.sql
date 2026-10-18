CREATE TABLE IF NOT EXISTS deletion_requests (
  customer_id INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  notified_at INTEGER
);
