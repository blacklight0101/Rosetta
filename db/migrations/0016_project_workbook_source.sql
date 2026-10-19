-- 0016_project_workbook_source: a project's source may also be Excel workbooks rendered to text
-- (data-model.md section 4; RF-152, DEC-150, RFC-005 section 4.1). Additive: the kind check admits
-- one more value, so every project that exists keeps its kind, and the table-level grants of
-- rosetta_app (0002) already cover the table.
--
-- Like an upload, a workbook project has no address, ref or subpath, so the three columns are empty
-- for both. The unique index "one project per user, address, ref and subpath" already binds the
-- GitHub projects only (0014), so any number of workbook projects can exist. The columns of the
-- stored source (0015) stay as they are; the card that stores the rendered tree widens them.

ALTER TABLE projects DROP CONSTRAINT projects_source_kind_check;
ALTER TABLE projects ADD CONSTRAINT projects_source_kind_check
  CHECK (source_kind IN ('github', 'upload', 'workbook'));

ALTER TABLE projects DROP CONSTRAINT projects_upload_source_empty;
ALTER TABLE projects ADD CONSTRAINT projects_upload_source_empty CHECK (
  source_kind = 'github' OR (source_url = '' AND ref = '' AND subpath = '')
);
