import { describe } from 'vitest';
import { PgProjectRepository } from '../../../../src/infrastructure/db/pg-project-repository.js';
import { PgUserRepository } from '../../../../src/infrastructure/db/pg-user-repository.js';
import {
  projectWorkbookSourceContract,
  workbookProjectOwners,
} from '../../../contracts/project-workbook-source.contract.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// RF-152, ADR-016: PgProjectRepository stores workbook projects on the disposable PostgreSQL.
describe.skipIf(!hasTestDatabase)('PgProjectRepository with workbook projects', () => {
  const database = useTestDatabase();

  projectWorkbookSourceContract('PgProjectRepository', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const users = new PgUserRepository(pool);
    for (const [index, id] of workbookProjectOwners.entries()) {
      await users.insert(sampleAccount({ id, userName: `owner${String(index)}` }));
    }
    return new PgProjectRepository(pool);
  });
});
