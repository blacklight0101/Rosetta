-- 0018_runs_unread_areas: a run keeps the number of planned areas no reader started (data-model.md
-- section 4; P7-02, DEC-194), so the run page, the history list and the Projects table can show a
-- capped run as "Partly read". Additive: existing runs read 0, and the table-level grants of
-- rosetta_app (0002) already cover the new column.

ALTER TABLE runs ADD COLUMN unread_areas integer NOT NULL DEFAULT 0 CHECK (unread_areas >= 0);
