import { describe, expect, it } from 'vitest';
import { PgJourneyFacts } from '../../../../src/infrastructure/db/pg-journey-facts.js';
import { PgProjectRepository } from '../../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../../src/infrastructure/db/pg-run-index.js';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { insert, newId, run, user } from '../../../support/db-rows.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// P8-143, P8-139, DEC-226, RF-615, data-model.md section 4: the backfill fills the facts of a run's
// end only while the run's `ended_at` is still the end time the pass read, compared in milliseconds,
// so a run that ended again after the pass read it keeps the facts of its newer end. Runs in CI's
// database job (PostgreSQL 17).

const NULL_FACTS = {
  deepenParentId: null,
  planSourceKey: null,
  endCode: null,
  supportedClaims: null,
  openQuestions: null,
};

/** What the run index and the end writer store when the run ends at `$1` with no code. */
const END =
  "UPDATE runs SET queue_state = 'Ended', end_state = 'Interrupted', started_at = $1, ended_at = $1, end_code = NULL, supported_claims = NULL";

async function endedRun(pool: DatabasePool, at: string): Promise<void> {
  const userId = newId();
  await insert(pool, user({ id: userId, user_name: 'owner' }));
  const project = sampleProject({ id: newId(), userId, sourceUrl: 'https://github.com/o/owner' });
  await new PgProjectRepository(pool).insertOrFind(project);
  await insert(pool, run(project.id, userId, { run_key: '20261001-090000-understand' }));
  await pool.query(END, [at]);
}

describe.skipIf(!hasTestDatabase)('the backfill and a run that ends again', () => {
  const database = useTestDatabase();

  it('RF-615 a fill gives the facts of the end it read, its time stored in microseconds', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    // A time a writer of PostgreSQL stored with microseconds: the pass reads it in milliseconds.
    await endedRun(pool, '2026-10-12T09:00:00.123456Z');
    const facts = new PgJourneyFacts(pool);
    const [read] = await facts.pendingRuns(10);
    if (read === undefined) throw new Error('No pending run');

    await facts.fillRun(read, { ...NULL_FACTS, endCode: 'RST-1806', supportedClaims: 3 });

    const found = await new PgRunIndex(pool).find(read.userId, read.id);
    expect(found).toMatchObject({ endCode: 'RST-1806', supportedClaims: 3 });
    expect(await facts.pendingRuns(10)).toEqual([]);
  });

  it('RF-615 a fill keeps the newer end of a run that ended again after the pass read it, a null code included', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    await endedRun(pool, '2026-10-12T09:00:00.123Z');
    const facts = new PgJourneyFacts(pool);
    const [read] = await facts.pendingRuns(10);
    if (read === undefined) throw new Error('No pending run');
    // The run is resumed and ends again, with no code: its writer stores the newer end.
    await pool.query(END, ['2026-10-12T09:30:00.000Z']);

    await facts.fillRun(read, {
      ...{ deepenParentId: null, planSourceKey: '20261001-080000-understand' },
      ...{ endCode: 'RST-1806', supportedClaims: 3, openQuestions: 2 },
    });

    const found = await new PgRunIndex(pool).find(read.userId, read.id);
    expect(found).toMatchObject({
      ...{ planSourceKey: '20261001-080000-understand', openQuestions: 2 },
      endedAt: Date.parse('2026-10-12T09:30:00.000Z'),
    });
    // A null column is a fact nobody stored: the row mapper leaves the key out.
    expect(found).not.toHaveProperty('endCode');
    expect(found).not.toHaveProperty('supportedClaims');
    expect(await facts.pendingRuns(10)).toEqual([]);
  });
});
