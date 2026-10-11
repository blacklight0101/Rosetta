-- 0003_cost_ledger_audit: the cost ledger, cost reservations and the audit trail
-- (data-model.md section 4; RF-428, RF-1106, RF-1109, DEC-55, DEC-112). The ledger and the audit
-- trail are append-only for rosetta_app: insert and select, never update or delete.

CREATE TABLE cost_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id),
  project_id uuid,
  run_id uuid,
  stage text NOT NULL
    CHECK (stage IN ('scan', 'understand', 'verify', 'report', 'plan', 'provider-test')),
  role text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  call_id text NOT NULL,
  attempt int NOT NULL CHECK (attempt >= 1),
  key_source text NOT NULL CHECK (key_source IN ('user', 'server', 'none')),
  input_tokens bigint NOT NULL,
  output_tokens bigint NOT NULL,
  cached_input_tokens bigint NOT NULL,
  usage_source text NOT NULL CHECK (usage_source IN ('reported', 'estimated')),
  cost_micros bigint NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  price_table_version text NOT NULL
);

CREATE INDEX cost_ledger_user_id_at_idx ON cost_ledger (user_id, at);
CREATE INDEX cost_ledger_at_idx ON cost_ledger (at);

CREATE TABLE cost_reservations (
  call_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  key_source text NOT NULL CHECK (key_source IN ('user', 'server', 'none')),
  worst_case_micros bigint NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL,
  actor_user_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  ip text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('ok', 'refused', 'failed')),
  detail jsonb NOT NULL
);

CREATE INDEX audit_events_at_idx ON audit_events (at);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_app') THEN
    GRANT SELECT, INSERT ON cost_ledger, audit_events TO rosetta_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON cost_reservations TO rosetta_app;
  END IF;
END
$$;
