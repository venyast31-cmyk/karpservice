CREATE TABLE IF NOT EXISTS shop_catalog (product_id TEXT PRIMARY KEY, category_id TEXT NOT NULL, seen_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS shop_orders (
  public_id TEXT PRIMARY KEY, customer_id INTEGER NOT NULL, request_key TEXT NOT NULL,
  status TEXT NOT NULL, total_cents INTEGER NOT NULL, snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL, crm_id INTEGER,
  UNIQUE(customer_id, request_key)
);
CREATE INDEX IF NOT EXISTS shop_orders_customer ON shop_orders(customer_id, created_at);
