import { describe } from 'vitest';
import { MemoryProjectConsents } from '../../../../src/infrastructure/db/memory-project-consents.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import {
  consentOwners,
  projectConsentWithdrawalContract,
  projectConsentsContract,
} from '../../../contracts/project-consents.contract.js';
import { sampleProject } from '../../../support/project-fixtures.js';

// Architecture section 7: the memory adapter passes the same contract as PgProjectConsents.
async function fresh(): Promise<MemoryProjectConsents> {
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(
    sampleProject({ id: consentOwners.project, userId: consentOwners.amy }),
  );
  return new MemoryProjectConsents(projects);
}

describe('MemoryProjectConsents', () => {
  projectConsentsContract('MemoryProjectConsents', fresh);
  projectConsentWithdrawalContract('MemoryProjectConsents', fresh);
});
