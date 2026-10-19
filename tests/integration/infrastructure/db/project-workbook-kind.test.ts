import { beforeAll, describe, expect, it } from 'vitest';
import { readMigrationFiles } from '../../../../src/infrastructure/db/migration-files.js';
import { PgMigrator } from '../../../../src/infrastructure/db/pg-migrator.js';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { insert, newId, outcomeOf, user, type Insert } from '../../../support/db-rows.js';
import {
  hasTestDatabase,
  migrationsFolder,
  testClock,
  useTestDatabase,
} from '../../../support/postgres.js';

// RF-152, RF-130, data-model.md section 4 (`projects`), RFC-005 section 4.1: migration 0016 lets a
// project be of kind `workbook`, with an empty source address, ref and subpath like an upload; the
// rows that existed before it, GitHub and upload, are untouched.

const CHECK_VIOLATION = '23514';
const owner = newId();
const KEY = `upload__${newId()}@0123456789abcdef`;

interface ProjectRow {
  readonly id: string;
  readonly source_kind: string;
  readonly source_url: string;
  readonly ref: string;
  readonly subpath: string;
  readonly source_snapshot_key: string | null;
  readonly source_file_name: string | null;
}

interface Source {
  readonly kind: string;
  readonly url: string;
  readonly ref?: string;
  readonly subpath?: string;
}

function projectOf(source: Source, snapshot?: { key: string; file: string }): Insert {
  const at = new Date('2026-10-19T08:00:00.000Z');
  return {
    sql: 'INSERT INTO projects (id, user_id, name, source_kind, source_url, ref, subpath, source_snapshot_key, source_file_name, source_uploaded_at, settings, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
    params: [
      newId(),
      owner,
      'Pricing',
      source.kind,
      source.url,
      source.ref ?? '',
      source.subpath ?? '',
      snapshot?.key ?? null,
      snapshot?.file ?? null,
      snapshot === undefined ? null : at,
      { schemaVersion: 1 },
      at,
      at,
    ],
  };
}

describe.skipIf(!hasTestDatabase)('projects.source_kind workbook', () => {
  const database = useTestDatabase();
  let pool: DatabasePool;

  beforeAll(async () => {
    ({ pool } = await database.createSchema({ migrate: true }));
    await insert(pool, user({ id: owner, user_name: 'owner' }));
  });

  it('RF-152 a workbook with an empty source address, ref and subpath is stored', async () => {
    expect(await outcomeOf(pool, projectOf({ kind: 'workbook', url: '' }))).toBe('ok');
  });

  it('RF-152 one user can have several workbook projects', async () => {
    await insert(pool, projectOf({ kind: 'workbook', url: '' }));

    expect(await outcomeOf(pool, projectOf({ kind: 'workbook', url: '' }))).toBe('ok');
  });

  it.each([
    ['a source address', { url: 'https://github.com/owner/repo' }],
    ['a ref', { url: '', ref: 'main' }],
    ['a subpath', { url: '', subpath: 'src' }],
  ])('RF-152 a workbook that holds %s is refused', async (_what, source) => {
    expect(await outcomeOf(pool, projectOf({ kind: 'workbook', ...source }))).toBe(CHECK_VIOLATION);
  });

  it('RF-152 a kind that does not exist is still refused', async () => {
    expect(await outcomeOf(pool, projectOf({ kind: 'folder', url: '' }))).toBe(CHECK_VIOLATION);
  });

  it('RF-130 an upload that holds a source address is still refused', async () => {
    const source = { kind: 'upload', url: 'https://github.com/owner/repo' };

    expect(await outcomeOf(pool, projectOf(source))).toBe(CHECK_VIOLATION);
  });
});

describe.skipIf(!hasTestDatabase)('migration 0016 on a database that holds projects', () => {
  const database = useTestDatabase();
  let pool: DatabasePool;
  const github = projectOf({ kind: 'github', url: 'https://github.com/owner/kept', ref: 'main' });
  const upload = projectOf({ kind: 'upload', url: '' }, { key: KEY, file: 'OrderDesk.zip' });

  async function snapshotOfRows(): Promise<readonly ProjectRow[]> {
    const rows = await pool.query<ProjectRow>(
      'SELECT id, source_kind, source_url, ref, subpath, source_snapshot_key, source_file_name FROM projects ORDER BY source_kind',
    );
    return rows.rows;
  }

  beforeAll(async () => {
    ({ pool } = await database.createSchema({ migrate: false }));
    const all = await readMigrationFiles(migrationsFolder);
    const before = all.filter((migration) => migration.version < 16);
    await new PgMigrator({ pool, migrations: before, clock: testClock }).migrate();
    await insert(pool, user({ id: owner, user_name: 'owner' }));
    await insert(pool, github);
    await insert(pool, upload);
  });

  it('RF-152 keeps the github and upload rows as they were and lets a workbook in', async () => {
    const rowsBefore = await snapshotOfRows();
    expect(await outcomeOf(pool, projectOf({ kind: 'workbook', url: '' }))).toBe(CHECK_VIOLATION);

    const all = await readMigrationFiles(migrationsFolder);
    const applied = await new PgMigrator({ pool, migrations: all, clock: testClock }).migrate();

    expect(applied.map((migration) => migration.version)).toEqual([16]);
    expect(await snapshotOfRows()).toEqual(rowsBefore);
    expect(rowsBefore).toHaveLength(2);
    expect(await outcomeOf(pool, projectOf({ kind: 'workbook', url: '' }))).toBe('ok');
  });

  it('RF-128 the upload row still holds its zip and the github source is still unique', async () => {
    const dup = projectOf({ kind: 'github', url: 'https://github.com/owner/kept', ref: 'main' });

    expect(await outcomeOf(pool, dup)).toBe('23505');
    const rows = await pool.query<{ source_snapshot_key: string | null }>(
      "SELECT source_snapshot_key FROM projects WHERE source_kind = 'upload'",
    );
    expect(rows.rows).toEqual([{ source_snapshot_key: KEY }]);
  });
});
