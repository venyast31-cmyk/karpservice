CREATE TABLE IF NOT EXISTS hidden_customer_cars (
  customer_id INTEGER NOT NULL,
  car_key TEXT NOT NULL,
  asset_id INTEGER NOT NULL DEFAULT 0,
  vin TEXT NOT NULL DEFAULT '',
  hidden_at INTEGER NOT NULL,
  PRIMARY KEY (customer_id, car_key)
);

CREATE INDEX IF NOT EXISTS idx_hidden_customer_cars_customer
  ON hidden_customer_cars (customer_id);
