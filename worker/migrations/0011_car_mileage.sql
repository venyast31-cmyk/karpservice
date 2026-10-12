CREATE TABLE IF NOT EXISTS customer_car_mileage (
  customer_id INTEGER NOT NULL,
  car_key TEXT NOT NULL,
  mileage INTEGER NOT NULL CHECK(mileage >= 0 AND mileage <= 9999999),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(customer_id, car_key)
);
