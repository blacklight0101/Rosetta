import { z } from 'zod';
import type { SnapshotUsage } from '../../application/ports/run-index.js';
import { RUN_END_STATES, RUN_QUEUE_STATES, RUN_STAGES } from '../../domain/runs/run-states.js';
import type { Run } from '../../domain/runs/run.js';

// Data-model.md section 4, `runs`: the columns every run query selects, the row schema and the
// mapping to the domain type. Times become epoch milliseconds; `bigint` columns come back from
// `pg` as text and become numbers (micro-USD and token counts stay far below 2^53).

/** Every column, in table order, with ids and counters as text. */
export const RUN_COLUMNS =
  'id::text AS id, project_id::text AS project_id, user_id::text AS user_id, run_key, stage, commit_sha, snapshot_key, queue_state, end_state, queued_at, started_at, ended_at, cost_micros::text AS cost_micros, input_tokens::text AS input_tokens, output_tokens::text AS output_tokens, cached_input_tokens::text AS cached_input_tokens';

const instant = z.date().transform((date) => date.getTime());
const counter = z.string().regex(/^\d+$/).transform(Number);

const runRowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  user_id: z.string(),
  run_key: z.string(),
  stage: z.enum(RUN_STAGES),
  commit_sha: z.string().nullable(),
  snapshot_key: z.string().nullable(),
  queue_state: z.enum(RUN_QUEUE_STATES),
  end_state: z.enum(RUN_END_STATES).nullable(),
  queued_at: instant,
  started_at: instant.nullable(),
  ended_at: instant.nullable(),
  cost_micros: counter,
  input_tokens: counter,
  output_tokens: counter,
  cached_input_tokens: counter,
});

const snapshotUsageRow = z.object({
  snapshot_key: z.string(),
  runs: z.number().int(),
  active: z.number().int(),
  last_used_at: instant,
});

// RF-1012
export function toSnapshotUsage(row: unknown): SnapshotUsage {
  const parsed = snapshotUsageRow.parse(row);
  return {
    snapshotKey: parsed.snapshot_key,
    runs: parsed.runs,
    active: parsed.active,
    lastUsedAt: parsed.last_used_at,
  };
}

// RF-003
export function toRun(row: unknown): Run {
  const parsed = runRowSchema.parse(row);
  return {
    id: parsed.id,
    projectId: parsed.project_id,
    userId: parsed.user_id,
    runKey: parsed.run_key,
    stage: parsed.stage,
    commitSha: parsed.commit_sha,
    snapshotKey: parsed.snapshot_key,
    queueState: parsed.queue_state,
    endState: parsed.end_state,
    queuedAt: parsed.queued_at,
    startedAt: parsed.started_at,
    endedAt: parsed.ended_at,
    totals: {
      costMicros: parsed.cost_micros,
      inputTokens: parsed.input_tokens,
      outputTokens: parsed.output_tokens,
      cachedInputTokens: parsed.cached_input_tokens,
    },
  };
}
