-- 0024_journey_facts: the facts the journey strip is drawn from, stored by the code that knows them
-- (data-model.md section 4; P8-139, RF-615, RF-1108, DEC-226). Before, they were read from each
-- run's files (manifest, cards, answers.md, events, planning-brief.json) on every journey read.
--   runs.deepen_parent_id   the run a Deepen improves (written when the Deepen is queued)
--   runs.plan_source_key    the folder name of the understand run a plan run is written from
--                           (written when the plan is queued with a named source, and by the
--                           planner when it chooses the source)
--   runs.end_code           the `RST` code the `run.ended` event said (written when the run ends)
--   runs.supported_claims   the Supported claims of an understand run that ended `Completed` or
--                           `CapReached` (written when it ends)
--   runs.open_questions     the open questions of the understand run's family, the same number on
--                           every run of the family (written when a run of the family ends, an
--                           answer is saved, a question is reopened or a run is deleted)
--   projects.brief_saved_at when the planning brief was saved (written when it is saved)
-- Null is a fact nobody stored: the journey reads it as it read a missing file.
-- `facts_backfilled` marks the rows the backfill still has to fill from the files: false on every row,
-- the ones that exist now and every one inserted later. A row is filled by the first backfill pass
-- after it is inserted (at start-up, then daily); the fill keeps any fact a writer stored (COALESCE),
-- so filling a row the writers already filled changes nothing. Rows the previous image inserts while
-- it still serves during a deploy, or after a rollback, get no fact from a writer and are filled all
-- the same (environments-and-delivery.md sections 10 and 11).
-- Locks: the plain ADD COLUMN statements and the constant `DEFAULT false NOT NULL` only change the
-- catalogue (no rewrite). Each of the three ADD COLUMN ... CHECK statements also reads `runs` once
-- to validate its constraint (every value is null), under the ACCESS EXCLUSIVE lock the migration's
-- one transaction holds until it commits; a sequential read of the table, measured at about 140 ms
-- for 2 million rows on PostgreSQL 17.
-- Additive: the table-level grants of rosetta_app (0002) already cover the new columns.

ALTER TABLE runs ADD COLUMN deepen_parent_id uuid;
ALTER TABLE runs ADD COLUMN plan_source_key text;
ALTER TABLE runs ADD COLUMN end_code text
  CONSTRAINT runs_end_code_check CHECK (end_code ~ '^RST-[0-9]{4}$');
ALTER TABLE runs ADD COLUMN supported_claims integer
  CONSTRAINT runs_supported_claims_check CHECK (supported_claims >= 0);
ALTER TABLE runs ADD COLUMN open_questions integer
  CONSTRAINT runs_open_questions_check CHECK (open_questions >= 0);
ALTER TABLE runs ADD COLUMN facts_backfilled boolean NOT NULL DEFAULT false;

ALTER TABLE projects ADD COLUMN brief_saved_at timestamptz;
ALTER TABLE projects ADD COLUMN facts_backfilled boolean NOT NULL DEFAULT false;
