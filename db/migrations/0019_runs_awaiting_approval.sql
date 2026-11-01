-- 0019_runs_awaiting_approval: the queue state `AwaitingApproval` (data-model.md section 4; P7-05,
-- RF-432, ADR-026, DEC-196). A run that nears the amount its owner approved pauses there: it is
-- not ended (no end state), holds no running slot and waits for Continue or Stop. Only the check
-- of the queue states changes; the check that an end state is set exactly when the run has ended
-- already covers the new state.

ALTER TABLE runs DROP CONSTRAINT runs_queue_state_check;
ALTER TABLE runs ADD CONSTRAINT runs_queue_state_check
  CHECK (queue_state IN ('Queued', 'Running', 'AwaitingApproval', 'Ended'));
