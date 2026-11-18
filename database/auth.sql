CREATE TABLE IF NOT EXISTS bookstore_auth_attempts (
    id_hash text PRIMARY KEY,
    state text NOT NULL,
    nonce text NOT NULL,
    code_verifier text NOT NULL,
    return_to text NOT NULL,
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS bookstore_auth_attempts_expiration
    ON bookstore_auth_attempts (expires_at);

CREATE TABLE IF NOT EXISTS bookstore_auth_sessions (
    id_hash text PRIMARY KEY,
    subject uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    access_token_expires_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS bookstore_auth_sessions_expiration
    ON bookstore_auth_sessions (expires_at);
