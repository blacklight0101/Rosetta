import { beforeAll, describe, expect, it } from 'vitest';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { insert, newId, outcomeOf, project, user, type Insert } from '../../../support/db-rows.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// RF-130, RF-128, data-model.md section 4 (`projects`), RFC-004 section 4.1: a project has a source
// kind, `github` unless it says `upload`. An upload has an empty source address, ref and subpath
// (the database refuses anything else) and is never one project with another upload, however
// alike; the same GitHub source stays one project per user.

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const owner = newId();

interface Source {
  readonly kind: string;
  readonly url: string;
  readonly ref?: string;
  readonly subpath?: string;
}

function projectOf(source: Source): Insert {
  const at = new Date('2026-10-19T08:00:00.000Z');
  return {
    sql: 'INSERT INTO projects (id, user_id, name, source_kind, source_url, ref, subpath, settings, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    params: [
      newId(),
      owner,
      'OrderDesk',
      source.kind,
      source.url,
      source.ref ?? '',
      source.subpath ?? '',
      { schemaVersion: 1 },
      at,
      at,
    ],
  };
}

describe.skipIf(!hasTestDatabase)('projects.source_kind', () => {
  const database = useTestDatabase();
  let pool: DatabasePool;

  beforeAll(async () => {
    ({ pool } = await database.createSchema({ migrate: true }));
    await insert(pool, user({ id: owner, user_name: 'owner' }));
  });

  it('RF-130 a project inserted without a kind is a github project', async () => {
    const row = project(owner);

    await insert(pool, row);

    const kinds = await pool.query<{ source_kind: string }>(
      'SELECT source_kind FROM projects WHERE id = $1',
      [row.params[0]],
    );
    expect(kinds.rows).toEqual([{ source_kind: 'github' }]);
  });

  it('RF-130 an upload with an empty source address, ref and subpath is stored', async () => {
    expect(await outcomeOf(pool, projectOf({ kind: 'upload', url: '' }))).toBe('ok');
  });

  it('RF-130 a project of a kind that does not exist is refused', async () => {
    expect(await outcomeOf(pool, projectOf({ kind: 'folder', url: '' }))).toBe(CHECK_VIOLATION);
  });

  it.each([
    ['a source address', { url: 'https://github.com/owner/repo' }],
    ['a ref', { url: '', ref: 'main' }],
    ['a subpath', { url: '', subpath: 'src' }],
  ])('RF-130 an upload that holds %s is refused', async (_what, source) => {
    expect(await outcomeOf(pool, projectOf({ kind: 'upload', ...source }))).toBe(CHECK_VIOLATION);
  });
});

describe.skipIf(!hasTestDatabase)('projects.source_kind uniqueness', () => {
  const database = useTestDatabase();
  let pool: DatabasePool;

  beforeAll(async () => {
    ({ pool } = await database.createSchema({ migrate: true }));
    await insert(pool, user({ id: owner, user_name: 'owner' }));
  });

  it('RF-128 one user can have several uploads', async () => {
    await insert(pool, projectOf({ kind: 'upload', url: '' }));

    expect(await outcomeOf(pool, projectOf({ kind: 'upload', url: '' }))).toBe('ok');
  });

  it('RF-010 the same github source is still one project per user', async () => {
    const source = { kind: 'github', url: 'https://github.com/owner/once' };
    await insert(pool, projectOf(source));

    expect(await outcomeOf(pool, projectOf(source))).toBe(UNIQUE_VIOLATION);
    expect(await outcomeOf(pool, projectOf({ ...source, ref: 'v2' }))).toBe('ok');
  });
});
