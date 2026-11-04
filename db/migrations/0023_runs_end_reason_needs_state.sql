-- 0023_runs_end_reason_needs_state: a run keeps an end reason only when it ended `Interrupted`
-- (data-model.md section 4; P8-123, follow-up of P8-111, RF-006). The rule of 0022,
-- `end_reason IS NULL OR end_state = 'Interrupted'`, is unknown when `end_state` is null, and a
-- CHECK accepts an unknown result, so a run with no end state could carry a reason. The rule is
-- rewritten with IS NOT DISTINCT FROM, which is false in that case. A reason on a row that has no
-- end state is cleared first, so that the stricter rule can be added: that row reads as an
-- interrupted run with no recorded reason does, with the wording it had before 0022. Rows with an
-- end state other than `Interrupted` cannot carry a reason, 0022 already refused them.

UPDATE runs SET end_reason = NULL WHERE end_reason IS NOT NULL AND end_state IS NULL;

ALTER TABLE runs DROP CONSTRAINT runs_end_reason_interrupted;
ALTER TABLE runs ADD CONSTRAINT runs_end_reason_interrupted
  CHECK (end_reason IS NULL OR end_state IS NOT DISTINCT FROM 'Interrupted');
