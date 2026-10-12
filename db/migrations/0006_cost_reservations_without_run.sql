-- 0006_cost_reservations_without_run: a model call that belongs to no run can be reserved and
-- metered (data-model.md section 4; RF-407, RF-422, RF-428, P1-29).
-- The provider test of the settings page (RF-407) calls each role's model through the budget guard
-- like a run does, but there is no run: its ledger row already has a null run_id and the stage
-- 'provider-test' (0003), and its reservation now may have a null run_id too. A reservation with no
-- run is summed by no run cap (the sums compare run_id with = and null equals nothing); it counts
-- against the user's day and the server's month like every other reservation. Existing rows keep
-- their meaning.

ALTER TABLE cost_reservations ALTER COLUMN run_id DROP NOT NULL;
