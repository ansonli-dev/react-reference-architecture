CREATE TABLE IF NOT EXISTS bookstore_cart_drafts (
    subject text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS bookstore_cart_items (
    subject text NOT NULL REFERENCES bookstore_cart_drafts(subject),
    book_id uuid NOT NULL,
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
    revision uuid NOT NULL,
    title text NOT NULL,
    price_minor bigint NOT NULL CHECK (price_minor BETWEEN 0 AND 9007199254740991),
    PRIMARY KEY (subject, book_id)
);

CREATE TABLE IF NOT EXISTS bookstore_checkout_quotes (
    subject text NOT NULL,
    quote_id uuid NOT NULL,
    draft_lines jsonb NOT NULL,
    submission_id uuid,
    state text CHECK (state IN ('PROCESSING', 'RECONCILE_REQUIRED', 'PLACED', 'REJECTED')),
    PRIMARY KEY (subject, quote_id),
    UNIQUE (subject, submission_id)
);

CREATE INDEX IF NOT EXISTS bookstore_checkout_pending
    ON bookstore_checkout_quotes (subject)
    WHERE state IN ('PROCESSING', 'RECONCILE_REQUIRED');
