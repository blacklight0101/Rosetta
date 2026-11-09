import { describe, expect, it } from 'vitest';
import { readMigrationFiles } from '../../../../src/infrastructure/db/migration-files.js';
import { PgJourneyFacts } from '../../../../src/infrastructure/db/pg-journey-facts.js';
import { PgMigrator } from '../../../../src/infrastructure/db/pg-migrator.js';
import { PgProjectRepository } from '../../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../../src/infrastructure/db/pg-run-index.js';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { insert, newId, outcomeOf, run, user } from '../../../support/db-rows.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import {
  hasTestDatabase,
  migrationsFolder,
  testClock,
  useTestDatabase,
  type TestDatabase,
} from '../../../support/postgres.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// P8-139, DEC-226, RF-615, RF-1108, data-model.md section 4: the journey facts stored on `runs` and
// `projects` (migration 0024), written by PgRunIndex (the Deepen parent and the named plan source,
// with the row) and PgJourneyFacts (the other writers and the backfill).

const CHECK_VIOLATION = '23514';
const NULL_FACTS = {
  deepenParentId: null,
  planSourceKey: null,
  endCode: null,
  supportedClaims: null,
  openQuestions: null,
};

interface Parents {
  readonly userId: string;
  readonly projectId: string;
}

async function parentsIn(target: DatabasePool, name = 'owner'): Promise<Parents> {
  const userId = newId();
  await insert(target, user({ id: userId, user_name: name }));
  // A project the repository can read back, settings included.
  const saved = sampleProject({ id: newId(), userId, sourceUrl: `https://github.com/o/${name}` });
  await new PgProjectRepository(target).insertOrFind(saved);
  return { userId, projectId: saved.id };
}

function runOf(parents: Parents, key: string, extra: Parameters<typeof sampleRun>[0] = {}) {
  return sampleRun({ id: newId(), ...parents, runKey: key, ...extra });
}

interface World {
  readonly pool: DatabasePool;
  readonly parents: Parents;
  readonly runs: PgRunIndex;
  readonly facts: PgJourneyFacts;
}

/**
 * A migrated schema of its own with an owner and a project, for one test: the stress job repeats
 * and shuffles the tests of a file, and run keys and user names are unique in a schema.
 */
async function worldIn(database: TestDatabase): Promise<World> {
  const { pool } = await database.createSchema({ migrate: true });
  const parents = await parentsIn(pool);
  return { pool, parents, runs: new PgRunIndex(pool), facts: new PgJourneyFacts(pool) };
}

describe.skipIf(!hasTestDatabase)('migration 0024', () => {
  const database = useTestDatabase();

  it('DEC-226 RF-615 every row is left for the backfill, also a row the previous image inserts after 0024', async () => {
    const { pool } = await database.createSchema({ migrate: false });
    const files = await readMigrationFiles(migrationsFolder);
    const apply = async (upTo: number): Promise<void> => {
      const migrations = files.filter((file) => file.version <= upTo);
      await new PgMigrator({ pool, migrations, clock: testClock }).migrate();
    };
    await apply(23);
    const parents = await parentsIn(pool);
    const before = run(parents.projectId, parents.userId, { run_key: '20261001-090000-scan' });
    await insert(pool, before);

    await apply(24);
    // The previous image still serves while the migrate job runs (environments-and-delivery.md
    // section 10 step 4) and serves again after a rollback (section 11): its insert names no fact.
    const after = run(parents.projectId, parents.userId, { run_key: '20261002-090000-scan' });
    await insert(pool, after);
    const later = await parentsIn(pool, 'later');

    const runs = await pool.query<Record<string, unknown>>(
      'SELECT run_key, facts_backfilled, deepen_parent_id, plan_source_key, end_code, supported_claims, open_questions FROM runs ORDER BY run_key',
    );
    const empty = { deepen_parent_id: null, plan_source_key: null, end_code: null };
    const noCounts = { supported_claims: null, open_questions: null };
    expect(runs.rows).toEqual([
      { run_key: '20261001-090000-scan', facts_backfilled: false, ...empty, ...noCounts },
      { run_key: '20261002-090000-scan', facts_backfilled: false, ...empty, ...noCounts },
    ]);
    const projects = await pool.query('SELECT brief_saved_at, facts_backfilled FROM projects');
    expect(projects.rows).toEqual([
      { brief_saved_at: null, facts_backfilled: false },
      { brief_saved_at: null, facts_backfilled: false },
    ]);
    const facts = new PgJourneyFacts(pool);
    const pending = await facts.pendingRuns(10);
    expect(pending.map((each) => each.runKey)).toEqual([
      '20261001-090000-scan',
      '20261002-090000-scan',
    ]);
    const projectsLeft = await facts.pendingProjects(10);
    expect(projectsLeft).toHaveLength(2);
    expect(projectsLeft).toEqual(expect.arrayContaining([parents, later]));
  });
});

describe.skipIf(!hasTestDatabase)('migration 0024 and the previous image', () => {
  const database = useTestDatabase();

  it('DEC-226 RF-615 a row the previous image inserted after 0024 is filled and then left alone', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const parents = await parentsIn(pool);
    const old = run(parents.projectId, parents.userId, { run_key: '20261002-090000-understand' });
    await insert(pool, old);
    const facts = new PgJourneyFacts(pool);
    const id = String(old.params[0]);

    await facts.fillRun(
      { id, endedAt: null },
      { ...NULL_FACTS, supportedClaims: 3, openQuestions: 2 },
    );
    await facts.fillProject(parents.projectId, Date.parse('2026-10-12T09:30:00.000Z'));

    const found = await new PgRunIndex(pool).find(parents.userId, id);
    expect(found).toMatchObject({ supportedClaims: 3, openQuestions: 2 });
    expect(await facts.pendingRuns(10)).toEqual([]);
    expect(await facts.pendingProjects(10)).toEqual([]);
  });
});

describe.skipIf(!hasTestDatabase)('the journey facts columns', () => {
  const database = useTestDatabase();
  const update = (sql: string, params: unknown[]) => ({ sql, params });

  it('DEC-226 an end code is an RST code and the counts are never negative', async () => {
    const { pool, parents, runs } = await worldIn(database);
    const id = (await runs.insert(runOf(parents, '20261003-090000-understand'))).ok;
    expect(id).toBe(true);
    const set = (column: string, value: unknown) =>
      outcomeOf(pool, update(`UPDATE runs SET ${column} = $1`, [value]));

    expect(await set('end_code', 'RST-1806')).toBe('ok');
    expect(await set('end_code', 'boom')).toBe(CHECK_VIOLATION);
    expect(await set('supported_claims', -1)).toBe(CHECK_VIOLATION);
    expect(await set('open_questions', -1)).toBe(CHECK_VIOLATION);
  });

  it('DEC-226 RF-1302 rosetta_app may write every journey fact', async () => {
    const { pool, parents, runs } = await worldIn(database);
    expect((await runs.insert(runOf(parents, '20261003-090000-understand'))).ok).toBe(true);
    const runFacts = update(
      'UPDATE runs SET deepen_parent_id = $1, plan_source_key = $2, end_code = $3, supported_claims = $4, open_questions = $5, facts_backfilled = true',
      [newId(), '20261003-090000-understand', 'RST-1806', 3, 2],
    );
    const projects = update(
      'UPDATE projects SET brief_saved_at = now(), facts_backfilled = true',
      [],
    );

    expect(await outcomeOf(pool, runFacts, 'rosetta_app')).toBe('ok');
    expect(await outcomeOf(pool, projects, 'rosetta_app')).toBe('ok');
  });
});

describe.skipIf(!hasTestDatabase)('the writers of the journey facts', () => {
  const database = useTestDatabase();

  it('RF-1108 DEC-226 a queued Deepen and a plan run keep the run they come from on their row', async () => {
    const { parents, runs } = await worldIn(database);
    const deepen = runOf(parents, '20261004-090000-understand', { deepenParentId: newId() });
    const plan = runOf(parents, '20261004-090000-plan', {
      stage: 'plan',
      planSourceKey: '20261003-090000-understand',
    });
    await runs.insert(deepen);
    await runs.insert(plan);

    expect(await runs.find(parents.userId, deepen.id)).toEqual(deepen);
    expect(await runs.find(parents.userId, plan.id)).toEqual(plan);
  });
});

describe.skipIf(!hasTestDatabase)('the writers of the journey facts (end and questions)', () => {
  const database = useTestDatabase();

  it('RF-615 DEC-226 the end, the plan source and the open questions are stored on the run', async () => {
    const { parents, runs, facts } = await worldIn(database);
    const understand = runOf(parents, '20261005-090000-understand');
    const plan = runOf(parents, '20261005-100000-plan', { stage: 'plan' });
    await runs.insert(understand);
    await runs.insert(plan);

    await facts.recordEnd(understand.id, { endCode: 'RST-1802', supportedClaims: 4 });
    await facts.recordOpenQuestions(parents.userId, [understand.id], 2);
    await facts.recordPlanSource(plan.id, understand.runKey);

    expect(await runs.find(parents.userId, understand.id)).toEqual({
      ...understand,
      ...{ endCode: 'RST-1802', supportedClaims: 4, openQuestions: 2 },
    });
    expect(await runs.find(parents.userId, plan.id)).toEqual({
      ...plan,
      planSourceKey: understand.runKey,
    });
    await facts.recordEnd(understand.id, { endCode: null, supportedClaims: null });
    expect(await runs.find(parents.userId, understand.id)).toEqual({
      ...understand,
      openQuestions: 2,
    });
  });
});

describe.skipIf(!hasTestDatabase)('the writers of the journey facts (owner and brief)', () => {
  const database = useTestDatabase();

  it('RF-1105 DEC-226 another user cannot store open questions on a run that is not theirs', async () => {
    const { pool, parents, runs, facts } = await worldIn(database);
    const understand = runOf(parents, '20261006-090000-understand');
    await runs.insert(understand);
    const other = await parentsIn(pool, 'other');

    await facts.recordOpenQuestions(other.userId, [understand.id], 9);

    expect((await runs.find(parents.userId, understand.id))?.openQuestions).toBeUndefined();
  });

  it('RF-615 DEC-226 the brief time is stored on the project', async () => {
    const { pool, parents, facts } = await worldIn(database);
    const savedAt = Date.parse('2026-10-12T09:30:00.123Z');

    await facts.recordBriefSaved(parents.userId, parents.projectId, savedAt);

    const found = await new PgProjectRepository(pool).find(parents.userId, parents.projectId);
    expect(found?.briefSavedAt).toBe(savedAt);
  });
});

describe.skipIf(!hasTestDatabase)('the backfill rows', () => {
  const database = useTestDatabase();

  it('DEC-226 a fill keeps what a writer stored, marks the row and is not offered again', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const parents = await parentsIn(pool);
    const older = run(parents.projectId, parents.userId, { run_key: '20261001-090000-understand' });
    await insert(pool, older);
    const parentId = newId();
    // What the writers stored in every column since the row was inserted.
    await pool.query(
      'UPDATE runs SET deepen_parent_id = $1, plan_source_key = $2, end_code = $3, supported_claims = $4, open_questions = $5',
      [parentId, '20261001-080000-understand', 'RST-1802', 7, 5],
    );
    await pool.query('UPDATE projects SET brief_saved_at = $1', [
      new Date('2026-10-12T10:00:00.000Z'),
    ]);
    const facts = new PgJourneyFacts(pool);

    const pending = await facts.pendingRuns(10);
    expect(pending.map((each) => each.runKey)).toEqual(['20261001-090000-understand']);
    await facts.fillRun(
      { id: String(older.params[0]), endedAt: null },
      {
        ...{ deepenParentId: newId(), planSourceKey: '20261001-070000-understand' },
        ...{ endCode: 'RST-1806', supportedClaims: 3, openQuestions: 1 },
      },
    );
    expect(await facts.pendingProjects(10)).toEqual([parents]);
    await facts.fillProject(parents.projectId, Date.parse('2026-10-12T09:30:00.000Z'));

    const found = await new PgRunIndex(pool).find(parents.userId, String(older.params[0]));
    expect(found).toMatchObject({
      ...{ deepenParentId: parentId, planSourceKey: '20261001-080000-understand' },
      ...{ endCode: 'RST-1802', supportedClaims: 7, openQuestions: 5 },
    });
    expect(await facts.pendingRuns(10)).toEqual([]);
    expect(await facts.pendingProjects(10)).toEqual([]);
    const project = await new PgProjectRepository(pool).find(parents.userId, parents.projectId);
    expect(project?.briefSavedAt).toBe(Date.parse('2026-10-12T10:00:00.000Z'));
  });
});
