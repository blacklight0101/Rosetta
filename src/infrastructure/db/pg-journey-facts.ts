import type { EpochMs } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Run } from '../../domain/runs/run.js';
import type {
  JourneyFactsBackfill,
  JourneyFactsStore,
  PendingProject,
  RunEndFacts,
  StoredRunFacts,
} from '../../application/ports/journey-facts-store.js';
import type { DatabasePool } from './pool.js';
import { RUN_COLUMNS, toRun } from './run-rows.js';
import { z } from 'zod';

// P8-139, DEC-226, ADR-016, data-model.md section 4: the journey facts on `runs` and `projects`, with
// parameterised SQL only. Each writer is one UPDATE of the rows it names; the open questions are
// written only on the user's runs. The backfill reads the rows that existed before migration 0024
// a few at a time and fills each with one UPDATE that keeps any fact a writer stored since
// (COALESCE) and marks the row filled. The facts of the run's end are filled only while `ended_at`
// is still the end time the pass read (P8-143): the row reads back in milliseconds, so the column is
// cut to milliseconds before the comparison. A database failure is thrown as RST-2404 with the cause.

const RECORD_PLAN_SOURCE = 'UPDATE runs SET plan_source_key = $2 WHERE id = $1';
const RECORD_END = 'UPDATE runs SET end_code = $2, supported_claims = $3 WHERE id = $1';
const RECORD_OPEN_QUESTIONS =
  'UPDATE runs SET open_questions = $3 WHERE user_id = $1 AND id = ANY($2::uuid[])';
const RECORD_BRIEF_SAVED = 'UPDATE projects SET brief_saved_at = $3 WHERE user_id = $1 AND id = $2';
const PENDING_RUNS =
  'SELECT ' + RUN_COLUMNS + ' FROM runs WHERE NOT facts_backfilled ORDER BY queued_at, id LIMIT $1';
/** The run still has the end the pass read; a run that ended again keeps its newer end facts. */
const SAME_END = "date_trunc('milliseconds', ended_at) IS NOT DISTINCT FROM $7::timestamptz";
const FILL_RUN =
  'UPDATE runs SET deepen_parent_id = COALESCE(deepen_parent_id, $2::uuid), plan_source_key = COALESCE(plan_source_key, $3), ' +
  `end_code = CASE WHEN ${SAME_END} THEN COALESCE(end_code, $4) ELSE end_code END, ` +
  `supported_claims = CASE WHEN ${SAME_END} THEN COALESCE(supported_claims, $5) ELSE supported_claims END, ` +
  'open_questions = COALESCE(open_questions, $6), facts_backfilled = true WHERE id = $1';
const PENDING_PROJECTS =
  'SELECT id::text AS project_id, user_id::text AS user_id FROM projects WHERE NOT facts_backfilled ORDER BY created_at, id LIMIT $1';
const FILL_PROJECT =
  'UPDATE projects SET brief_saved_at = COALESCE(brief_saved_at, $2), facts_backfilled = true WHERE id = $1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pendingProjectRow = z.object({ project_id: z.string(), user_id: z.string() });
const instantOf = (at: EpochMs | null): Date | null => (at === null ? null : new Date(at));
/** An id that is not a UUID names no row; a parent that is not one is not stored (a foreign file). */
const uuidOrNull = (id: string | null): string | null => (id !== null && UUID.test(id) ? id : null);
/** A code that is not an `RST` code (a foreign event) is not stored. */
const codeOrNull = (code: string | null): string | null =>
  code !== null && /^RST-[0-9]{4}$/.test(code) ? code : null;

export class PgJourneyFacts implements JourneyFactsStore, JourneyFactsBackfill {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async recordPlanSource(runId: string, sourceKey: string): Promise<void> {
    if (UUID.test(runId)) await this.run(RECORD_PLAN_SOURCE, [runId, sourceKey]);
  }

  async recordEnd(runId: string, facts: RunEndFacts): Promise<void> {
    if (!UUID.test(runId)) return;
    await this.run(RECORD_END, [runId, facts.endCode, facts.supportedClaims]);
  }

  async recordOpenQuestions(
    userId: string,
    runIds: readonly string[],
    count: number,
  ): Promise<void> {
    const ids = runIds.filter((id) => UUID.test(id));
    if (!UUID.test(userId) || ids.length === 0) return;
    await this.run(RECORD_OPEN_QUESTIONS, [userId, ids, count]);
  }

  async recordBriefSaved(userId: string, projectId: string, savedAt: EpochMs): Promise<void> {
    if (!UUID.test(userId) || !UUID.test(projectId)) return;
    await this.run(RECORD_BRIEF_SAVED, [userId, projectId, new Date(savedAt)]);
  }

  async pendingRuns(limit: number): Promise<readonly Run[]> {
    return (await this.run(PENDING_RUNS, [limit])).rows.map(toRun);
  }

  async fillRun(read: Pick<Run, 'id' | 'endedAt'>, facts: StoredRunFacts): Promise<void> {
    await this.run(FILL_RUN, [
      ...[read.id, uuidOrNull(facts.deepenParentId), facts.planSourceKey],
      ...[codeOrNull(facts.endCode), facts.supportedClaims, facts.openQuestions],
      instantOf(read.endedAt),
    ]);
  }

  async pendingProjects(limit: number): Promise<readonly PendingProject[]> {
    const { rows } = await this.run(PENDING_PROJECTS, [limit]);
    return rows.map((row) => {
      const parsed = pendingProjectRow.parse(row);
      return { userId: parsed.user_id, projectId: parsed.project_id };
    });
  }

  async fillProject(projectId: string, briefSavedAt: EpochMs | null): Promise<void> {
    await this.run(FILL_PROJECT, [projectId, instantOf(briefSavedAt)]);
  }

  private async run(sql: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
    try {
      return await this.pool.query<Record<string, unknown>>(sql, values);
    } catch (error) {
      throw new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
    }
  }
}
