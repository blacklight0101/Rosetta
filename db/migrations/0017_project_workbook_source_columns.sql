-- 0017_project_workbook_source_columns: the stored source of a project may be the workbooks of a
-- workbook project, and a source may say how many workbooks it holds (data-model.md section 4;
-- RF-150, RF-152, DEC-150, RFC-005 section 4.2). Additive: one nullable column, and the check of
-- 0015 now admits the kind `workbook` beside `upload`. Every project that exists keeps its columns,
-- and the table-level grants of rosetta_app (0002) already cover the new column.
--
-- `source_snapshot_key`, `source_file_name` and `source_uploaded_at` stay all set or all null. For a
-- workbook project the file name holds the names of its workbooks, joined by commas, and the key
-- is `workbook__<id>@<16 hex>`. `source_workbooks` is the number of workbooks of the source (of a
-- workbook project, or the ones a zip held); it is null when there are none, and only a source has it.

ALTER TABLE projects ADD COLUMN source_workbooks integer;

ALTER TABLE projects DROP CONSTRAINT projects_upload_source_complete;
ALTER TABLE projects ADD CONSTRAINT projects_upload_source_complete CHECK (
  (
    source_snapshot_key IS NULL
    AND source_file_name IS NULL
    AND source_uploaded_at IS NULL
    AND source_workbooks IS NULL
  )
  OR (
    source_kind IN ('upload', 'workbook')
    AND source_snapshot_key IS NOT NULL
    AND source_file_name IS NOT NULL
    AND source_uploaded_at IS NOT NULL
    AND (source_workbooks IS NULL OR source_workbooks >= 1)
  )
);
