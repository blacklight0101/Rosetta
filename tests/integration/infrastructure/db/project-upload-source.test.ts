import { beforeAll, describe, expect, it } from 'vitest';
import { PgProjectRepository } from '../../../../src/infrastructure/db/pg-project-repository.js';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { insert, newId, outcomeOf, run, user, type Insert } from '../../../support/db-rows.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// RF-128, data-model.md section 4 (`projects`): an upload project records the snapshot, the file
// name and the instant of its current zip together or not at all, only for the kind `upload`; the
// project reads the snapshot its newest run with a source analysed.

const CHECK_VIOLATION = '23514';
const owner = newId();
const SNAPSHOT = `upload__${newId()}@0123456789abcdef`;
const at = new Date('2026-10-19T08:00:00.000Z');

interface Source {
  readonly kind?: string;
  readonly key?: string;
  readonly name?: string;
  readonly uploadedAt?: Date;
}

function projectOf(source: Source): Insert {
  return {
    sql: 'INSERT INTO projects (id, user_id, name, source_kind, source_url, ref, subpath, settings, created_at, updated_at, source_snapshot_key, source_file_name, source_uploaded_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
    params: [
      newId(),
      owner,
      'OrderDesk',
      source.kind ?? 'upload',
      source.kind === 'github' ? 'https://github.com/o/r' : '',
      '',
      '',
      { schemaVersion: 1 },
      at,
      at,
      source.key ?? null,
      source.name ?? null,
      source.uploadedAt ?? null,
    ],
  };
}

describe.skipIf(!hasTestDatabase)('projects: the source of an upload', () => {
  const database = useTestDatabase();
  let pool: DatabasePool;

  beforeAll(async () => {
    ({ pool } = await database.createSchema({ migrate: true }));
    await insert(pool, user({ id: owner, user_name: 'owner' }));
  });

  it('RF-128 an upload project may have no source yet', async () => {
    expect(await outcomeOf(pool, projectOf({}))).toBe('ok');
  });

  it('RF-128 an upload project may hold all three columns of its source', async () => {
    const row = projectOf({ key: SNAPSHOT, name: 'a.zip', uploadedAt: at });

    expect(await outcomeOf(pool, row)).toBe('ok');
  });

  it('RF-128 a GitHub project holds none of them', async () => {
    const row = projectOf({ kind: 'github', key: SNAPSHOT, name: 'a.zip', uploadedAt: at });

    expect(await outcomeOf(pool, row)).toBe(CHECK_VIOLATION);
  });

  it.each([
    ['a key without a name', { key: SNAPSHOT }],
    ['a name without a key', { name: 'a.zip' }],
    ['an instant alone', { uploadedAt: at }],
  ])('RF-128 refuses %s', async (_what, columns) => {
    const row = projectOf(columns);

    expect(await outcomeOf(pool, row)).toBe(CHECK_VIOLATION);
  });
});

describe.skipIf(!hasTestDatabase)('projects: the snapshot of the newest run', () => {
  const database = useTestDatabase();

  async function setup(): Promise<{
    projects: PgProjectRepository;
    id: string;
    pool: DatabasePool;
  }> {
    const { pool } = await database.createSchema({ migrate: true });
    await insert(pool, user({ id: owner, user_name: 'owner' }));
    const row = projectOf({});
    await insert(pool, row);
    const id = String(row.params[0]);
    return { projects: new PgProjectRepository(pool), id, pool };
  }

  async function addRun(pool: DatabasePool, id: string, key: string | null, minutes: number) {
    const row = run(id, owner, { queued_at: new Date(at.getTime() + minutes * 60_000) });
    await insert(pool, row);
    await pool.query('UPDATE runs SET snapshot_key = $2 WHERE id = $1', [row.params[0], key]);
  }

  it('RF-128 a project without runs has no snapshot of a last run', async () => {
    const { projects, id } = await setup();

    expect((await projects.find(owner, id))?.lastRunSnapshotKey).toBeUndefined();
  });

  it('RF-128 the project reads the snapshot of its newest run that has one', async () => {
    const { projects, id, pool } = await setup();
    await addRun(pool, id, 'upload__older', 1);
    await addRun(pool, id, 'upload__newer', 2);
    await addRun(pool, id, null, 3);

    expect((await projects.find(owner, id))?.lastRunSnapshotKey).toBe('upload__newer');
    expect((await projects.list(owner))[0]?.lastRunSnapshotKey).toBe('upload__newer');
  });
});
