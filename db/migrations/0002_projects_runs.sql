-- 0002_projects_runs: projects and the run index (data-model.md section 4; RF-003, RF-010,
-- RF-1105, RF-1108). States are the canonical lists of architecture.md section 5.

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id),
  name text NOT NULL,
  source_url text NOT NULL,
  ref text NOT NULL,
  subpath text NOT NULL,
  settings jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT projects_source_key UNIQUE (user_id, source_url, ref, subpath)
);

CREATE INDEX projects_user_id_idx ON projects (user_id);

CREATE TABLE runs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id),
  run_key text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('scan', 'understand', 'verify', 'report', 'plan')),
  commit_sha text,
  snapshot_key text,
  queue_state text NOT NULL CHECK (queue_state IN ('Queued', 'Running', 'Ended')),
  end_state text CHECK (end_state IN ('Completed', 'CapReached', 'Failed', 'Interrupted')),
  queued_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  cost_micros bigint NOT NULL,
  input_tokens bigint NOT NULL,
  output_tokens bigint NOT NULL,
  cached_input_tokens bigint NOT NULL,
  CONSTRAINT runs_run_key_key UNIQUE (project_id, run_key),
  CONSTRAINT runs_end_state_check_ended CHECK ((queue_state = 'Ended') = (end_state IS NOT NULL))
);

CREATE INDEX runs_commit_sha_idx ON runs (commit_sha);
CREATE INDEX runs_snapshot_key_idx ON runs (snapshot_key);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects, runs TO rosetta_app;
  END IF;
END
$$;
