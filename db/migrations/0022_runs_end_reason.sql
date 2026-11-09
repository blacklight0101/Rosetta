-- 0022_runs_end_reason: a run that ended `Interrupted` keeps why (data-model.md section 4; P8-111,
-- RF-006, RF-1008, RF-1020, DEC-217). `UserStop`: its owner pressed Stop on it while it ran;
-- `Restart`: the server restarted or shut down under it; `QueueCancel`: it was cancelled while it
-- waited in the queue. The pages word an interrupted run by this reason, so a restart or a queue
-- cancel no longer reads "Stopped by you". Null for every other end state, for a run that ended
-- before this migration ran and for an interrupted run with no recorded reason: those keep the
-- wording they had. Additive: the table-level grants of rosetta_app (0002) already cover the column.

ALTER TABLE runs ADD COLUMN end_reason text
  CONSTRAINT runs_end_reason_check CHECK (end_reason IN ('UserStop', 'Restart', 'QueueCancel'));
ALTER TABLE runs ADD CONSTRAINT runs_end_reason_interrupted
  CHECK (end_reason IS NULL OR end_state = 'Interrupted');
