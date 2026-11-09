import { beforeAll, describe, expect, it } from 'vitest';
import { readMigrationFiles } from '../../../../src/infrastructure/db/migration-files.js';
import { PgMigrator } from '../../../../src/infrastructure/db/pg-migrator.js';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import {
  insert,
  newId,
  outcomeOf,
  project,
  run,
  user,
  type Insert,
} from '../../../support/db-rows.js';
import {
  hasTestDatabase,
  migrationsFolder,
  testClock,
  useTestDatabase,
} from '../../../support/postgres.js';

// RF-006, RF-1008, data-model.md section 4 (`runs.end_reason`; P8-123, follow-up of P8-111): a run
// keeps a reason only when it ended `Interrupted`. Migration 0022 wrote the rule as
// `end_state = 'Interrupted'`, which is unknown (so it passes) when `end_state` is null; migration
// 0023 closes that gap and clears a reason that a run without an end state may already carry.

const CHECK_VIOLATION = '23514';

interface Parents {
  readonly userId: string;
  readonly projectId: string;
}

/** The shared run row with the `end_reason` column added as its last parameter. */
function runIn(parents: Parents, queue: string, end: string | null, reason: string | null): Insert {
  const base = run(parents.projectId, parents.userId, { queue_state: queue, end_state: end });
  return {
    sql: base.sql
      .replace('cached_input_tokens) VALUES (', 'cached_input_tokens, end_reason) VALUES (')
      .replace(/\)$/, ', $13)'),
    params: [...base.params, reason],
  };
}

async function parentsIn(target: DatabasePool): Promise<Parents> {
  const userId = newId();
  const projectRow = project(userId);
  await insert(target, user({ id: userId, user_name: 'owner' }));
  await insert(target, projectRow);
  return { userId, projectId: String(projectRow.params[0]) };
}

describe.skipIf(!hasTestDatabase)('runs.end_reason needs an end state', () => {
  const database = useTestDatabase();
  let pool: DatabasePool;
  let ids: Parents;

  beforeAll(async () => {
    ({ pool } = await database.createSchema({ migrate: true }));
    ids = await parentsIn(pool);
  });

  it('RF-006 a run with no end state cannot carry an end reason', async () => {
    const outcomes = [];
    for (const queue of ['Queued', 'Running', 'AwaitingApproval']) {
      outcomes.push(await outcomeOf(pool, runIn(ids, queue, null, 'UserStop')));
    }

    expect(outcomes).toEqual([CHECK_VIOLATION, CHECK_VIOLATION, CHECK_VIOLATION]);
  });

  it('RF-006 a run that ended in another state than Interrupted cannot carry an end reason', async () => {
    const outcome = await outcomeOf(pool, runIn(ids, 'Ended', 'Failed', 'Restart'));

    expect(outcome).toBe(CHECK_VIOLATION);
  });

  it('RF-006 an interrupted run keeps each of the three reasons and no other', async () => {
    const outcomes = [];
    for (const reason of ['UserStop', 'Restart', 'QueueCancel']) {
      outcomes.push(await outcomeOf(pool, runIn(ids, 'Ended', 'Interrupted', reason)));
    }

    expect(outcomes).toEqual(['ok', 'ok', 'ok']);
    expect(await outcomeOf(pool, runIn(ids, 'Ended', 'Interrupted', 'Crash'))).toBe(
      CHECK_VIOLATION,
    );
  });

  it('RF-006 a run without a reason is accepted with or without an end state', async () => {
    expect(await outcomeOf(pool, runIn(ids, 'Queued', null, null))).toBe('ok');
    expect(await outcomeOf(pool, runIn(ids, 'Ended', 'Interrupted', null))).toBe('ok');
    expect(await outcomeOf(pool, runIn(ids, 'Ended', 'Completed', null))).toBe('ok');
  });
});

describe.skipIf(!hasTestDatabase)('migration 0023', () => {
  const database = useTestDatabase();

  it('RF-006 a run that holds a reason without an end state loses it when the migration runs', async () => {
    const { pool: upgraded } = await database.createSchema({ migrate: false });
    const files = await readMigrationFiles(migrationsFolder);
    const apply = async (upTo: number): Promise<void> => {
      const migrations = files.filter((file) => file.version <= upTo);
      await new PgMigrator({ pool: upgraded, migrations, clock: testClock }).migrate();
    };
    await apply(22);
    const target = await parentsIn(upgraded);
    const stranded = runIn(target, 'Running', null, 'UserStop');
    const interrupted = runIn(target, 'Ended', 'Interrupted', 'Restart');
    await insert(upgraded, stranded);
    await insert(upgraded, interrupted);

    await apply(23);

    const reasons = await upgraded.query<{ id: string; end_reason: string | null }>(
      'SELECT id, end_reason FROM runs ORDER BY queue_state',
    );
    expect(reasons.rows.map((row) => [row.id, row.end_reason])).toEqual([
      [interrupted.params[0], 'Restart'],
      [stranded.params[0], null],
    ]);
  });
});
