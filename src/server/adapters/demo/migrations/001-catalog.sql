CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  author TEXT NOT NULL CHECK (length(author) BETWEEN 1 AND 255),
  category TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 80),
  price_minor INTEGER NOT NULL CHECK (price_minor BETWEEN 0 AND 9007199254740991),
  currency TEXT NOT NULL CHECK (currency IN ('CNY', 'USD')),
  stock INTEGER NOT NULL CHECK (stock BETWEEN 0 AND 2147483647)
) STRICT;

CREATE INDEX IF NOT EXISTS books_by_category ON books (category, id);

PRAGMA user_version = 1;
