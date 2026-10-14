import type { EpochMs } from '../../domain/accounts/user.js';
import type {
  ProjectRunSummary,
  RunIndex,
  RunSource,
  SnapshotUsage,
} from '../../application/ports/run-index.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Run, RunTotals } from '../../domain/runs/run.js';
import type { RunEndState } from '../../domain/runs/run-states.js';
import type { DatabasePool } from './pool.js';
import { RUN_COLUMNS, toProjectRunSummary, toRun, toSnapshotUsage } from './run-rows.js';

// Architecture section 7, ADR-016, RF-1108, RF-1105: the run rows in PostgreSQL with parameterised
// SQL only. User-triggered reads filter on `user_id`; every transition is one conditional UPDATE,
// so two parallel callers cannot both start or both end a run (the end state is set once). The
// foreign key (`project_id`, `user_id`) keeps a run with its project's owner. A database failure
// is thrown as RST-2404 with the cause.

const SELECT = 'SELECT ' + RUN_COLUMNS + ' FROM runs';
const RETURNING = ' RETURNING ' + RUN_COLUMNS;
const INSERT =
  'INSERT INTO runs (id, project_id, user_id, run_key, stage, commit_sha, snapshot_key, queue_state, end_state, queued_at, started_at, ended_at, cost_micros, input_tokens, output_tokens, cached_input_tokens) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) ON CONFLICT ON CONSTRAINT runs_run_key_key DO NOTHING';
const FIND = SELECT + ' WHERE user_id = $1 AND id = $2';
const LIST = SELECT + ' WHERE user_id = $1 AND project_id = $2 ORDER BY queued_at DESC, id';
// RF-1008: the newest run of each asked project (DISTINCT ON keeps the first row of each project in
// the order of LIST) with the project's run count, from one scan of the user's runs.
const PROJECT_SUMMARIES =
  'SELECT DISTINCT ON (project_id) ' +
  RUN_COLUMNS +
  ', (count(*) OVER (PARTITION BY project_id))::int AS run_count FROM runs WHERE user_id = $1 AND project_id = ANY($2::uuid[]) ORDER BY project_id, queued_at DESC, id';
const LIST_QUEUED = SELECT + " WHERE queue_state = 'Queued' ORDER BY queued_at, id";
const LIST_RUNNING = SELECT + " WHERE queue_state = 'Running' ORDER BY started_at, id";
const START =
  "UPDATE runs SET queue_state = 'Running', started_at = $2 WHERE id = $1 AND queue_state = 'Queued'" +
  RETURNING;
const END =
  "UPDATE runs SET queue_state = 'Ended', end_state = $2::text, ended_at = $3 WHERE id = $1 AND (queue_state = 'Running' OR (queue_state = 'Queued' AND $2::text = 'Interrupted'))" +
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
  async projectSummaries(
    userId: string,
    projectIds: readonly string[],
  ): Promise<readonly ProjectRunSummary[]> {
    const ids = projectIds.filter((id) => UUID.test(id));
    if (!UUID.test(userId) || ids.length === 0) return [];
    return (await this.run(PROJECT_SUMMARIES, [userId, ids])).rows.map(toProjectRunSummary);
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

  end(runId: string, endState: RunEndState, at: EpochMs): Promise<Run | undefined> {
    return this.change(runId, END, [endState, new Date(at)]);
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
