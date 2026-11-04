-- 0021_runs_running_time: a run keeps its first start and the time it has run (data-model.md
-- section 4; P8-88, RF-006, RF-1008). `started_at` is no longer cleared when a run is resumed or
-- continued; `span_started_at` is the start of the span the run is running in now, and `active_ms`
-- the milliseconds of its earlier spans, so History can show the running time (the sum of the
-- spans) beside the wall time. Additive: the table-level grants of rosetta_app (0002) already
-- cover the new columns. A run that ended before this migration ran once, or its last span is all
-- the record has: its running time is the time from its start to its end.

ALTER TABLE runs ADD COLUMN span_started_at timestamptz;
ALTER TABLE runs ADD COLUMN active_ms bigint NOT NULL DEFAULT 0 CHECK (active_ms >= 0);

UPDATE runs SET span_started_at = started_at WHERE queue_state = 'Running';
UPDATE runs
   SET active_ms = GREATEST(0, (EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000)::bigint)
 WHERE queue_state = 'Ended' AND started_at IS NOT NULL AND ended_at IS NOT NULL;
