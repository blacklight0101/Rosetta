-- 0001_accounts: users, sessions and provider keys (data-model.md section 4; RF-1100..RF-1104).
-- Ids and every *_at value come from the application (IdGenerator, Clock), so no column defaults
-- them. Roles are created outside the migrations; grants apply only where rosetta_app exists
-- (data-model.md section 6: a host with one database user has no separate application role).

CREATE TABLE users (
  id uuid PRIMARY KEY,
  user_name text NOT NULL CHECK (user_name ~ '^[a-z0-9._-]{3,40}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  state text NOT NULL CHECK (state IN ('Active', 'MustChangePassword', 'Disabled')),
  password_hash text NOT NULL,
  failed_sign_ins int NOT NULL CHECK (failed_sign_ins >= 0),
  first_failed_at timestamptz,
  locked_until timestamptz,
  server_keys_allowed boolean NOT NULL DEFAULT true,
  daily_cap_micros bigint,
  own_daily_cap_micros bigint,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  last_sign_in_at timestamptz
);

CREATE UNIQUE INDEX users_user_name_key ON users (lower(user_name));

CREATE TABLE sessions (
  id_hash bytea PRIMARY KEY CHECK (octet_length(id_hash) = 32),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  ip text NOT NULL,
  user_agent text NOT NULL CHECK (char_length(user_agent) <= 200)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE provider_keys (
  user_id uuid NOT NULL REFERENCES users (id),
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic', 'openai-compatible')),
  base_url text,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,
  key_version text NOT NULL,
  last4 text NOT NULL CHECK (char_length(last4) <= 4),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, provider),
  CONSTRAINT provider_keys_base_url_check
    CHECK (provider <> 'openai-compatible' OR base_url IS NOT NULL)
);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, provider_keys TO rosetta_app;
  END IF;
END
$$;
