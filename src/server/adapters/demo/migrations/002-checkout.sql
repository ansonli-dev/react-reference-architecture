CREATE TABLE demo_cart_items (
  shopper_id TEXT NOT NULL,
  book_id TEXT NOT NULL REFERENCES books (id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  line_version TEXT NOT NULL,
  PRIMARY KEY (shopper_id, book_id)
) STRICT;

CREATE TABLE demo_orders (
  id TEXT PRIMARY KEY NOT NULL,
  shopper_id TEXT NOT NULL,
  cart_revision TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('CNY', 'USD')),
  total_minor INTEGER NOT NULL CHECK (total_minor BETWEEN 0 AND 9007199254740991),
  created_at TEXT NOT NULL,
  UNIQUE (shopper_id, cart_revision)
) STRICT;

CREATE INDEX demo_orders_by_shopper ON demo_orders (shopper_id, created_at DESC);

CREATE TABLE demo_order_lines (
  order_id TEXT NOT NULL REFERENCES demo_orders (id),
  book_id TEXT NOT NULL,
  title TEXT NOT NULL,
  price_minor INTEGER NOT NULL CHECK (price_minor BETWEEN 0 AND 9007199254740991),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  PRIMARY KEY (order_id, book_id)
) STRICT;

PRAGMA user_version = 2;
