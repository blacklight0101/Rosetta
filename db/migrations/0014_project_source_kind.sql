-- 0014_project_source_kind: a project's source is a GitHub repository or an uploaded zip (data-model.md
-- section 4; RF-128, RF-130, DEC-148, RFC-004 section 4.1). Additive: every existing project reads
-- 'github', and the table-level grants of rosetta_app (0002) already cover the new column.
--
-- An upload has no address, ref or subpath, so its three columns are empty. The unique key "one
-- project per user, address, ref and subpath" would then make a user's second upload collide with the
-- first; it now binds the GitHub projects only. Same name, same columns, same effect for GitHub.

ALTER TABLE projects ADD COLUMN source_kind text NOT NULL DEFAULT 'github'
  CONSTRAINT projects_source_kind_check CHECK (source_kind IN ('github', 'upload'));

ALTER TABLE projects ADD CONSTRAINT projects_upload_source_empty CHECK (
  source_kind <> 'upload' OR (source_url = '' AND ref = '' AND subpath = '')
);

ALTER TABLE projects DROP CONSTRAINT projects_source_key;

CREATE UNIQUE INDEX projects_source_key ON projects (user_id, source_url, ref, subpath)
  WHERE source_kind = 'github';
