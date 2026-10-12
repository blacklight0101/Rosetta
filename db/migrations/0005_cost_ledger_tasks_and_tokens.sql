-- 0005_cost_ledger_tasks_and_tokens: the columns the budget guard needs that 0003 lacked
-- (data-model.md section 4; RF-422, RF-426, RF-427, RF-428, P1-27).
-- - cost_ledger.agent_task_id: the cost report breaks a run down by agent task (RF-426); null for
--   a provider test (RF-407).
-- - cost_ledger.cost_known: false for a model without a price run with the user's own key, whose
--   cost is unknown and stored as 0 (RF-427).
-- - cost_reservations.worst_case_tokens: the run token cap is reserved like the cost caps, so
--   parallel calls cannot pass it together (RF-422).
-- Existing rows keep their meaning through the defaults.

ALTER TABLE cost_ledger ADD COLUMN agent_task_id text;
ALTER TABLE cost_ledger ADD COLUMN cost_known boolean NOT NULL DEFAULT true;

ALTER TABLE cost_reservations
  ADD COLUMN worst_case_tokens bigint NOT NULL DEFAULT 0 CHECK (worst_case_tokens >= 0);

CREATE INDEX cost_ledger_run_id_idx ON cost_ledger (run_id);
CREATE INDEX cost_reservations_user_id_idx ON cost_reservations (user_id);
