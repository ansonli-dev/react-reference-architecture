CREATE TABLE demo_order_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  shopper_id TEXT NOT NULL,
  cart_revision TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('CNY', 'USD')),
  total_minor INTEGER NOT NULL CHECK (total_minor BETWEEN 0 AND 9007199254740991),
  expires_at TEXT NOT NULL,
  lines_json TEXT NOT NULL
) STRICT;

CREATE TABLE demo_order_submissions (
  id TEXT PRIMARY KEY NOT NULL,
  shopper_id TEXT NOT NULL,
  quote_id TEXT NOT NULL UNIQUE REFERENCES demo_order_quotes (id),
  idempotency_key TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE REFERENCES demo_orders (id),
  UNIQUE (shopper_id, idempotency_key)
) STRICT;

PRAGMA user_version = 3;
