-- 0007_cost_reservations_per_run_call: a reservation is the call of one user's run, not of a call
-- id alone (data-model.md section 4; RF-422, RF-1106).
-- A call id is `<runKey>#<n>` and a run key is unique only within a project (0002), so two users'
-- runs, or two projects of one user, can make calls with the same id at the same time. With
-- call_id as the primary key the second reservation failed, and settling or releasing one call
-- deleted the other user's reservation, which then no longer counted against any cap. The primary
-- key is replaced by one unique key over the user, the run and the call; a provider test has no
-- run (0006), and NULLS NOT DISTINCT keeps its call ids unique per user too. Existing rows keep
-- their meaning: every row was already unique by call_id alone.

ALTER TABLE cost_reservations DROP CONSTRAINT cost_reservations_pkey;

ALTER TABLE cost_reservations
  ADD CONSTRAINT cost_reservations_call_key UNIQUE NULLS NOT DISTINCT (user_id, run_id, call_id);
