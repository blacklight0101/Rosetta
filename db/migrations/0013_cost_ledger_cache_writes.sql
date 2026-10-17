-- 0013_cost_ledger_cache_writes: each ledger row keeps the tokens its call wrote to the provider's
-- prompt cache and what they cost (data-model.md section 4; RF-420, RF-426, RF-428, P2-16).
-- Anthropic bills a cache write at its own price (1.25 times the input price); the row's
-- `cost_micros` already includes that part, `cache_write_cost_micros` names it, fixed at call time
-- like the cost. Additive: rows written before this migration read 0, and the table-level grants
-- of rosetta_app (0003) already cover the new columns.

ALTER TABLE cost_ledger
  ADD COLUMN cache_write_input_tokens bigint NOT NULL DEFAULT 0
    CHECK (cache_write_input_tokens >= 0),
  ADD COLUMN cache_write_cost_micros bigint NOT NULL DEFAULT 0
    CHECK (cache_write_cost_micros >= 0);
