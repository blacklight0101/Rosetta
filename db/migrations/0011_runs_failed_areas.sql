-- 0011_runs_failed_areas: a run keeps the number of areas whose task gave no usable card (data-model.md
-- section 4; RF-208), so the run page, the history list and the Projects table can say that a run that
-- ended Completed did not read every area. Additive: existing runs read 0, and the table-level grants
-- of rosetta_app (0002) already cover the new column.

ALTER TABLE runs ADD COLUMN failed_areas integer NOT NULL DEFAULT 0 CHECK (failed_areas >= 0);
