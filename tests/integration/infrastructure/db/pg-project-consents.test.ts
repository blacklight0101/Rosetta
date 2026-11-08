import { describe } from 'vitest';
import { PgProjectConsents } from '../../../../src/infrastructure/db/pg-project-consents.js';
import { PgProjectRepository } from '../../../../src/infrastructure/db/pg-project-repository.js';
import { PgUserRepository } from '../../../../src/infrastructure/db/pg-user-repository.js';
import {
  consentOwners,
  projectConsentWithdrawalContract,
  projectConsentsContract,
} from '../../../contracts/project-consents.contract.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// RF-143, RF-142, RF-1105, DEC-209, ADR-016: PgProjectConsents on the disposable PostgreSQL, one
// migrated schema per test (migration 0025, `project_consent`).
describe.skipIf(!hasTestDatabase)('PgProjectConsents', () => {
  const database = useTestDatabase();
  const { amy, bob, project } = consentOwners;

  const fresh = async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const users = new PgUserRepository(pool);
    await users.insert(sampleAccount({ id: amy, userName: 'amy' }));
    await users.insert(sampleAccount({ id: bob, userName: 'bob' }));
    await new PgProjectRepository(pool).insertOrFind(sampleProject({ id: project, userId: amy }));
    return new PgProjectConsents(pool);
  };

  projectConsentsContract('PgProjectConsents', fresh);
  projectConsentWithdrawalContract('PgProjectConsents', fresh);
});
