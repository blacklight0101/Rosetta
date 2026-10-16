-- 0012_cost_reservations_role: a reservation names the role of its call (data-model.md section 4;
-- RF-423, RF-422). The budget guard sums, for a call, what its role has spent and has reserved in
-- the run against the role's caps (`budget.roles` of the project settings), so a reservation must
-- carry the role the way a ledger row already does. A reservation lives only as long as its call
-- (it is deleted when the call settles or is released, or purged when it expires), so existing rows
-- need no value: the column is null for them, and a null role is never equal to a role, so such a
-- row counts against no role cap.

ALTER TABLE cost_reservations ADD COLUMN role text;
