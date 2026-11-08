import type { EpochMs } from '../../domain/accounts/user.js';
import type { RunIndex, RunSource, SnapshotUsage } from '../../application/ports/run-index.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  RESUMABLE_END_STATES,
  type AreaCounts,
  type RunEndDetail,
  type Run,
  type RunTotals,
} from '../../domain/runs/run.js';
import type { RunEndState } from '../../domain/runs/run-states.js';
import type { DatabasePool } from './pool.js';
import { RUN_COLUMNS, toRun, toSnapshotUsage } from './run-rows.js';

// Architecture section 7, ADR-016, RF-1108, RF-1105: the run rows in PostgreSQL with parameterised
// SQL only. User-triggered reads filter on `user_id`; every transition is one conditional UPDATE,
// so two parallel callers cannot both start or both end a run (the end state is set once). The
// foreign key (`project_id`, `user_id`) keeps a run with its project's owner. A database failure
// is thrown as RST-2404 with the cause.

const SELECT = 'SELECT ' + RUN_COLUMNS + ' FROM runs';
const RETURNING = ' RETURNING ' + RUN_COLUMNS;
const INSERT =
  'INSERT INTO runs (id, project_id, user_id, run_key, stage, commit_sha, snapshot_key, queue_state, end_state, queued_at, started_at, ended_at, cost_micros, input_tokens, output_tokens, cached_input_tokens, failed_areas, unread_areas, span_started_at, active_ms, end_reason, deepen_parent_id, plan_source_key) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) ON CONFLICT ON CONSTRAINT runs_run_key_key DO NOTHING';
const FIND = SELECT + ' WHERE user_id = $1 AND id = $2';
const LIST = SELECT + ' WHERE user_id = $1 AND project_id = $2 ORDER BY queued_at DESC, id';
// RF-1008, P8-137: every run of the asked projects, newest first within a project, in one statement.
const LIST_OF_PROJECTS =
  SELECT +
  ' WHERE user_id = $1 AND project_id = ANY($2::uuid[]) ORDER BY project_id, queued_at DESC, id';
const LIST_QUEUED = SELECT + " WHERE queue_state = 'Queued' ORDER BY queued_at, id";
const LIST_RUNNING = SELECT + " WHERE queue_state = 'Running' ORDER BY started_at, id";
// P8-88: `started_at` is the first start and a resume keeps it; `span_started_at` and `active_ms`
// carry the running time, so a stopped or paused run does not count the wait.
const START =
  "UPDATE runs SET queue_state = 'Running', started_at = COALESCE(started_at, $2), span_started_at = $2 WHERE id = $1 AND queue_state = 'Queued'" +
  RETURNING;
// P8-88: the milliseconds of the span that ends at $3; 0 for a run that is not in a span.
const SPAN_MS =
  'COALESCE(GREATEST(0, (EXTRACT(EPOCH FROM ($3::timestamptz - span_started_at)) * 1000)::bigint), 0)';
// P8-122: the open span counts up to $7 (the last sign of life) when one is given, not up to the end.
const END_SPAN_MS =
  'COALESCE(GREATEST(0, (EXTRACT(EPOCH FROM (LEAST($3::timestamptz, COALESCE($7::timestamptz, $3::timestamptz)) - span_started_at)) * 1000)::bigint), 0)';
const END =
  "UPDATE runs SET queue_state = 'Ended', end_state = $2::text, ended_at = $3, failed_areas = $4, unread_areas = $5, end_reason = CASE WHEN $2::text = 'Interrupted' THEN $6::text END, span_started_at = NULL, active_ms = active_ms + " +
  END_SPAN_MS +
  " WHERE id = $1 AND (queue_state = 'Running' OR (queue_state = 'Queued' AND $2::text = 'Interrupted') OR (queue_state = 'AwaitingApproval' AND $2::text IN ('CapReached', 'Interrupted')))" +
  RETURNING;
// RF-432: a running run pauses near its approved amount; Continue queues the owner's paused run again.
const PAUSE =
  "UPDATE runs SET queue_state = 'AwaitingApproval', unread_areas = $2, span_started_at = NULL, active_ms = active_ms + " +
  SPAN_MS +
  " WHERE id = $1 AND queue_state = 'Running'" +
  RETURNING;
const CONTINUE =
  "UPDATE runs SET queue_state = 'Queued', unread_areas = 0, queued_at = $3 WHERE user_id = $1 AND id = $2 AND queue_state = 'AwaitingApproval'" +
  RETURNING;
// RF-006: one conditional UPDATE, so two parallel resumes queue the run once.
const REOPEN =
  "UPDATE runs SET queue_state = 'Queued', end_state = NULL, failed_areas = 0, unread_areas = 0, end_reason = NULL, queued_at = $3, ended_at = NULL WHERE user_id = $1 AND id = $2 AND queue_state = 'Ended' AND end_state = ANY($4::text[])" +
  RETURNING;
const RECORD_SOURCE =
  "UPDATE runs SET commit_sha = $2, snapshot_key = $3 WHERE id = $1 AND queue_state <> 'Ended'" +
  RETURNING;
const RECORD_TOTALS =
  "UPDATE runs SET cost_micros = $2, input_tokens = $3, output_tokens = $4, cached_input_tokens = $5 WHERE id = $1 AND queue_state <> 'Ended'" +
  RETURNING;

// RF-1012: only ended runs are removed, so a run cannot vanish under the queue; `cost_ledger` has
// no foreign key to `runs`, so its rows stay (DEC-55).
const REMOVE_ENDED = "DELETE FROM runs WHERE user_id = $1 AND id = $2 AND queue_state = 'Ended'";
const REMOVE_ENDED_OF_PROJECT =
  "DELETE FROM runs WHERE user_id = $1 AND project_id = $2 AND queue_state = 'Ended'";
const SNAPSHOT_USAGE =
  'SELECT snapshot_key, count(*)::int AS runs, (count(*) FILTER (WHERE queue_state <> \'Ended\'))::int AS active, max(COALESCE(ended_at, started_at, queued_at)) AS last_used_at FROM runs WHERE snapshot_key IS NOT NULL GROUP BY snapshot_key ORDER BY snapshot_key COLLATE "C"';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function queryFailed(error: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
}

export class PgRunIndex implements RunIndex {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async insert(run: Run): Promise<Result<Run, 'run-key-taken'>> {
    const inserted = await this.run(INSERT, [
      run.id,
      run.projectId,
      run.userId,
      run.runKey,
      run.stage,
      run.commitSha,
      run.snapshotKey,
      run.queueState,
      run.endState,
      new Date(run.queuedAt),
      run.startedAt === null ? null : new Date(run.startedAt),
      run.endedAt === null ? null : new Date(run.endedAt),
      run.totals.costMicros,
      run.totals.inputTokens,
      run.totals.outputTokens,
      run.totals.cachedInputTokens,
      run.failedAreas,
      run.unreadAreas,
      run.spanStartedAt === null ? null : new Date(run.spanStartedAt),
      run.activeMs,
      run.endReason,
      // RF-1108, DEC-226: a Deepen and a plan run keep the run they come from from the start.
      run.deepenParentId ?? null,
      run.planSourceKey ?? null,
    ]);
    return inserted.rowCount === 1 ? ok(run) : err('run-key-taken');
  }

  async find(userId: string, runId: string): Promise<Run | undefined> {
    // Not a UUID cannot name a row; asking PostgreSQL would fail on the uuid cast.
    if (!UUID.test(userId) || !UUID.test(runId)) return undefined;
    return this.one(FIND, [userId, runId]);
  }

  async list(userId: string, projectId: string): Promise<readonly Run[]> {
    if (!UUID.test(userId) || !UUID.test(projectId)) return [];
    return (await this.run(LIST, [userId, projectId])).rows.map(toRun);
  }

  // RF-1008
  async listOfProjects(userId: string, projectIds: readonly string[]): Promise<readonly Run[]> {
    const ids = projectIds.filter((id) => UUID.test(id));
    if (!UUID.test(userId) || ids.length === 0) return [];
    return (await this.run(LIST_OF_PROJECTS, [userId, ids])).rows.map(toRun);
  }

  async listQueued(): Promise<readonly Run[]> {
    return (await this.run(LIST_QUEUED, [])).rows.map(toRun);
  }

  async listRunning(): Promise<readonly Run[]> {
    return (await this.run(LIST_RUNNING, [])).rows.map(toRun);
  }

  start(runId: string, at: EpochMs): Promise<Run | undefined> {
    return this.change(runId, START, [new Date(at)]);
  }

  end(
    runId: string,
    endState: RunEndState,
    at: EpochMs,
    detail: RunEndDetail = {},
  ): Promise<Run | undefined> {
    const { failedAreas = 0, unreadAreas = 0, endReason = null, activeUntil } = detail;
    const until = activeUntil === undefined ? null : new Date(activeUntil);
    return this.change(runId, END, [
      ...[endState, new Date(at), failedAreas, unreadAreas, endReason],
      until,
    ]);
  }

  pause(runId: string, at: EpochMs, counts: AreaCounts = {}): Promise<Run | undefined> {
    return this.change(runId, PAUSE, [counts.unreadAreas ?? 0, new Date(at)]);
  }

  async continueAwaiting(userId: string, runId: string, at: EpochMs): Promise<Run | undefined> {
    if (!UUID.test(userId) || !UUID.test(runId)) return undefined;
    return this.one(CONTINUE, [userId, runId, new Date(at)]);
  }

  async reopen(
    userId: string,
    runId: string,
    at: EpochMs,
    states: readonly RunEndState[] = RESUMABLE_END_STATES,
  ): Promise<Run | undefined> {
    if (!UUID.test(userId) || !UUID.test(runId)) return undefined;
    return this.one(REOPEN, [userId, runId, new Date(at), states]);
  }

  recordSource(runId: string, source: RunSource): Promise<Run | undefined> {
    return this.change(runId, RECORD_SOURCE, [source.commitSha, source.snapshotKey]);
  }

  recordTotals(runId: string, totals: RunTotals): Promise<Run | undefined> {
    return this.change(runId, RECORD_TOTALS, [
      totals.costMicros,
      totals.inputTokens,
      totals.outputTokens,
      totals.cachedInputTokens,
    ]);
  }

  async removeEnded(userId: string, runId: string): Promise<boolean> {
    if (!UUID.test(userId) || !UUID.test(runId)) return false;
    return (await this.run(REMOVE_ENDED, [userId, runId])).rowCount === 1;
  }

  async removeEndedOfProject(userId: string, projectId: string): Promise<void> {
    if (!UUID.test(userId) || !UUID.test(projectId)) return;
    await this.run(REMOVE_ENDED_OF_PROJECT, [userId, projectId]);
  }

  async snapshotUsage(): Promise<readonly SnapshotUsage[]> {
    return (await this.run(SNAPSHOT_USAGE, [])).rows.map(toSnapshotUsage);
  }

  /** One UPDATE by run id; undefined when no row matched its conditions. */
  private change(runId: string, sql: string, values: unknown[]): Promise<Run | undefined> {
    if (!UUID.test(runId)) return Promise.resolve(undefined);
    return this.one(sql, [runId, ...values]);
  }

  private async one(sql: string, values: unknown[]): Promise<Run | undefined> {
    const [row] = (await this.run(sql, values)).rows;
    return row === undefined ? undefined : toRun(row);
  }

  private async run(
    sql: string,
    values: unknown[],
  ): Promise<{ readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }> {
    try {
      return await this.pool.query<Record<string, unknown>>(sql, values);
    } catch (error) {
      throw queryFailed(error);
    }
  }
}
