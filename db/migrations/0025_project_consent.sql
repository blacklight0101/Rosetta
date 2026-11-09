-- 0025_project_consent: the consents given on a project (data-model.md section 4; P8-77, RF-143,
-- RF-142, DEC-209, ADR-006). One row per consent: the non-local providers it names, its kinds
-- (`cloud`, the provider notice of RF-143; `private-code`, the confirmation of RF-132 and RF-157),
-- when it was given and, once withdrawn, when. A withdrawn consent keeps its row, so a run can
-- still name the consent it ran under. The owner is the project's, as for `runs` and `journeys`.

CREATE TABLE project_consent (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  providers text[] NOT NULL,
  kinds text[] NOT NULL,
  given_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  CONSTRAINT project_consent_project_owner_fkey FOREIGN KEY (project_id, user_id)
    REFERENCES projects (id, user_id) ON DELETE CASCADE,
  CONSTRAINT project_consent_providers_known CHECK (
    cardinality(providers) >= 1
    AND providers <@ ARRAY['anthropic', 'openai', 'openai-compatible', 'ollama']::text[]
  ),
  CONSTRAINT project_consent_kinds_known CHECK (
    cardinality(kinds) >= 1 AND kinds <@ ARRAY['cloud', 'private-code']::text[]
  ),
  CONSTRAINT project_consent_withdrawn_after_given CHECK (
    withdrawn_at IS NULL OR withdrawn_at >= given_at
  )
);

CREATE INDEX project_consent_project_given_idx ON project_consent (project_id, given_at);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON project_consent TO rosetta_app;
  END IF;
END
$$;
