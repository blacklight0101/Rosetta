-- 0026_runs_end_reason_stopped_at_approval: a paused run its owner stops with "Stop here" keeps why
-- (data-model.md section 4; P9-03, RF-432, EV-101). It still ends `CapReached`, with its work kept,
-- but no cap stopped it: its end reason is `StoppedAtApproval`, so the pages word it as the owner's
-- stop at the approved amount and not as a cap that was reached. The reason list gains the value;
-- the rule of 0023 (a reason needs the end state `Interrupted`) now lets this one reason, and only
-- this one, go with `CapReached`. Rows already written are untouched: a paused run stopped before
-- this migration keeps no reason and reads as it did.

ALTER TABLE runs DROP CONSTRAINT runs_end_reason_check;
ALTER TABLE runs ADD CONSTRAINT runs_end_reason_check
  CHECK (end_reason IN ('UserStop', 'Restart', 'QueueCancel', 'StoppedAtApproval'));

ALTER TABLE runs DROP CONSTRAINT runs_end_reason_interrupted;
ALTER TABLE runs ADD CONSTRAINT runs_end_reason_interrupted
  CHECK (
    end_reason IS NULL
    OR (end_reason = 'StoppedAtApproval' AND end_state IS NOT DISTINCT FROM 'CapReached')
    OR (end_reason <> 'StoppedAtApproval' AND end_state IS NOT DISTINCT FROM 'Interrupted')
  );
