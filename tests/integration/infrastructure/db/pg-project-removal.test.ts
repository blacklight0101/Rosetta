import { describe, expect, it } from 'vitest';
import { PgProjectRepository } from '../../../../src/infrastructure/db/pg-project-repository.js';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { PgUserRepository } from '../../../../src/infrastructure/db/pg-user-repository.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';
import { sampleProject } from '../../../support/project-fixtures.js';

// RF-1012, DEC-55, P1-121 (finding 1 of the P1-40 verdict): a project deletion that races a run
// being queued. One connection has inserted a queued run of the project and not committed yet; the
// deletion starts on another connection and must wait for it, then see the run and refuse, so the
// project, its queued run and its folder stay. Without the `FOR UPDATE` lock on the project row the
// guarded DELETE kept its first snapshot, removed the project and cascaded the run that had just
// been committed.

const amy = '00000000-0000-4000-9000-0000000000a1';
const queuedRunId = '00000000-0000-4000-b000-00000000a001';

const INSERT_QUEUED =
  "INSERT INTO runs (id, project_id, user_id, run_key, stage, queue_state, queued_at, cost_micros, input_tokens, output_tokens, cached_input_tokens) VALUES ($1, $2, $3, '20261013-090000-scan', 'scan', 'Queued', now(), 0, 0, 0, 0)";
const BLOCKED_BY =
  'SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int = ANY (pg_blocking_pids(pid))';
// Open transactions that hold a lock on a table of this test's own schema; other test files run
// beside this one on the same database, so a count over the whole database would see theirs.
const OPEN_TRANSACTIONS = `SELECT count(DISTINCT a.pid)::int AS n
  FROM pg_stat_activity a
  JOIN pg_locks l ON l.pid = a.pid
  JOIN pg_class c ON c.oid = l.relation
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = $1 AND a.state LIKE 'idle in transaction%'`;
const RUNS_WITHOUT_PROJECT =
  'SELECT count(*)::int AS n FROM runs WHERE NOT EXISTS (SELECT 1 FROM projects WHERE projects.id = runs.project_id)';

/** Waits until a statement of another connection waits for a lock the given backend holds. */
async function untilBlockedBy(pool: DatabasePool, backend: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [row] = (await pool.query<{ n: number }>(BLOCKED_BY, [backend])).rows;
    if ((row?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('The deletion never waited for the open insert.');
}

describe.skipIf(!hasTestDatabase)(
  'PgProjectRepository.remove under a concurrent run insert',
  () => {
    const database = useTestDatabase();

    it('RF-1012 a run queued while its project is deleted keeps the project, the run and the folder', async () => {
      const { pool } = await database.createSchema({ migrate: true });
      await new PgUserRepository(pool).insert(sampleAccount({ id: amy, userName: 'amy' }));
      const projects = new PgProjectRepository(pool);
      const project = sampleProject({ userId: amy });
      await projects.insertOrFind(project);
      const folderRemovals: string[] = [];
      const inserting = await pool.connect();
      let removed: boolean;
      try {
        const [own] = (await inserting.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
          .rows;
        await inserting.query('BEGIN');
        await inserting.query(INSERT_QUEUED, [queuedRunId, project.id, amy]);
        const removal = projects.remove(amy, project.id, () => {
          folderRemovals.push(project.id);
          return Promise.resolve();
        });
        await untilBlockedBy(pool, own?.pid ?? 0);
        await inserting.query('COMMIT');
        removed = await removal;
      } finally {
        inserting.release();
      }

      expect(removed).toBe(false);
      expect(folderRemovals).toEqual([]);
      expect(await projects.find(amy, project.id)).toEqual(project);
      const runs = await pool.query<{ id: string }>('SELECT id FROM runs');
      expect(runs.rows).toEqual([{ id: queuedRunId }]);
      expect((await pool.query<{ n: number }>(RUNS_WITHOUT_PROJECT)).rows).toEqual([{ n: 0 }]);
    });
  },
);

describe.skipIf(!hasTestDatabase)('PgProjectRepository.remove and the pool', () => {
  const database = useTestDatabase();

  it('RF-1012 releases the connection and the row lock before the folder removal starts', async () => {
    const { pool, name } = await database.createSchema({ migrate: true });
    await new PgUserRepository(pool).insert(sampleAccount({ id: amy, userName: 'amy' }));
    const projects = new PgProjectRepository(pool);
    const project = sampleProject({ userId: amy });
    await projects.insertOrFind(project);
    const seen: { checkedOut: number; open: number; listed: boolean }[] = [];

    const removed = await projects.remove(amy, project.id, async () => {
      const [row] = (await pool.query<{ n: number }>(OPEN_TRANSACTIONS, [name])).rows;
      await new Promise((resolve) => setTimeout(resolve, 50));
      seen.push({
        checkedOut: pool.totalCount - pool.idleCount,
        open: row?.n ?? -1,
        listed: (await projects.find(amy, project.id)) !== undefined,
      });
    });

    expect(removed).toBe(true);
    expect(seen).toEqual([{ checkedOut: 0, open: 0, listed: false }]);
  });
});
