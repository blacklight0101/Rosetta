-- 0004_server_settings_defaults: server settings and their defaults (data-model.md sections 4 and
-- 10; RF-1106, RF-1108, DEC-106, DEC-107). Caps in micro-dollars: run $0.50, user day $1.00,
-- server month $10.00; at most 2 running runs; defaultRoles stays empty until the administrator
-- sets it.

CREATE TABLE server_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid
);

INSERT INTO server_settings (key, value, updated_at) VALUES
  ('caps', '{"runMicros": 500000, "userDayMicros": 1000000, "serverMonthMicros": 10000000}', now()),
  ('queue', '{"maxRunning": 2}', now()),
  ('defaultRoles', '{}', now());

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON server_settings TO rosetta_app;
  END IF;
END
$$;
