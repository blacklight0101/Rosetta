-- 0015_project_upload_source: the zip an upload project holds now (data-model.md section 4; RF-128,
-- RF-130, DEC-148). Additive and nullable: every existing project has no uploaded source, and the
-- table-level grants of rosetta_app (0002) already cover the new columns.
--
-- The three columns are all set or all null, and only an upload project may set them. The snapshot
-- key names the folder under <data>/sources/ (upload__<project id>@<16 hex>); the name and the
-- instant are what the project page shows.

ALTER TABLE projects
  ADD COLUMN source_snapshot_key text,
  ADD COLUMN source_file_name text,
  ADD COLUMN source_uploaded_at timestamptz;

ALTER TABLE projects ADD CONSTRAINT projects_upload_source_complete CHECK (
  (source_snapshot_key IS NULL AND source_file_name IS NULL AND source_uploaded_at IS NULL)
  OR (
    source_kind = 'upload'
    AND source_snapshot_key IS NOT NULL
    AND source_file_name IS NOT NULL
    AND source_uploaded_at IS NOT NULL
  )
);
