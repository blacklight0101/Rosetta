import { describe, expect, it } from 'vitest';
import { PgProjectRepository } from '../../../../src/infrastructure/db/pg-project-repository.js';
import { PgServerSettings } from '../../../../src/infrastructure/db/pg-server-settings.js';
import { PgUserRepository } from '../../../../src/infrastructure/db/pg-user-repository.js';
import {
  projectOwners,
  projectRepositoryContract,
} from '../../../contracts/project-repository.contract.js';
import {
  serverCapsContract,
  serverSettingsContract,
} from '../../../contracts/server-settings.contract.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// Architecture section 7, ADR-016, RF-010: PgProjectRepository and PgServerSettings pass the
// contracts on the disposable PostgreSQL, one migrated schema per test.
describe.skipIf(!hasTestDatabase)('PgProjectRepository', () => {
  const database = useTestDatabase();

  projectRepositoryContract('PgProjectRepository', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const users = new PgUserRepository(pool);
    for (const [index, id] of projectOwners.entries()) {
      await users.insert(sampleAccount({ id, userName: `owner${String(index)}` }));
    }
    return new PgProjectRepository(pool);
  });

  it('RF-010 the stored settings are parsed again on every read', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const owner = sampleAccount({ userName: 'owner' });
    await new PgUserRepository(pool).insert(owner);
    const projects = new PgProjectRepository(pool);
    const project = sampleProject({ userId: owner.id });
    await projects.insertOrFind(project);
    await pool.query('UPDATE projects SET settings = \'{"schemaVersion": 1}\'::jsonb');

    await expect(projects.find(owner.id, project.id)).rejects.toThrow();
  });
});

describe.skipIf(!hasTestDatabase)('PgServerSettings', () => {
  const database = useTestDatabase();

  serverSettingsContract('PgServerSettings', async (roles) => {
    const { pool } = await database.createSchema({ migrate: true });
    await pool.query("UPDATE server_settings SET value = $1::jsonb WHERE key = 'defaultRoles'", [
      JSON.stringify(roles),
    ]);
    return new PgServerSettings(pool);
  });

  serverCapsContract('PgServerSettings', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    return new PgServerSettings(pool);
  });

  it('RF-1106 a caps value of a wrong shape is refused instead of guessed', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    await pool.query(
      "UPDATE server_settings SET value = '{\"runMicros\": -1}'::jsonb WHERE key = 'caps'",
    );

    await expect(new PgServerSettings(pool).caps()).rejects.toMatchObject({ code: 'RST-1000' });
  });

  it('DEC-106 a defaultRoles value of a wrong shape is refused instead of guessed', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    await pool.query(
      'UPDATE server_settings SET value = \'{"reader": "gpt"}\'::jsonb WHERE key = \'defaultRoles\'',
    );

    await expect(new PgServerSettings(pool).defaultRoles()).rejects.toThrow();
  });
});
