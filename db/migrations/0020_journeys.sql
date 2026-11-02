-- 0020_journeys: the journey of a project (data-model.md section 4; P7-34, RF-011, RF-435,
-- ADR-027). One row per project: the one amount the owner approved for the whole journey and when.
-- The steps are the project's runs queued since then, so no column of `runs` changes.

CREATE TABLE journeys (
  project_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  approved_tokens bigint NOT NULL CHECK (approved_tokens >= 0),
  approved_cost_micros bigint NOT NULL CHECK (approved_cost_micros >= 0),
  created_at timestamptz NOT NULL,
  CONSTRAINT journeys_project_owner_fkey FOREIGN KEY (project_id, user_id)
    REFERENCES projects (id, user_id) ON DELETE CASCADE
);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON journeys TO rosetta_app;
  END IF;
END
$$;
