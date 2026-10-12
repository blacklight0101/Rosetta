import { describe } from 'vitest';
import { MemoryProviderKeyRepository } from '../../../../src/infrastructure/db/memory-provider-key-repository.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { providerKeyRepositoryContract } from '../../../contracts/provider-key-repository.contract.js';

// Architecture section 7: the memory twin passes the same ProviderKeyRepository contract as the
// PostgreSQL adapter (RF-1104).
describe('MemoryProviderKeyRepository', () => {
  providerKeyRepositoryContract('MemoryProviderKeyRepository', () =>
    Promise.resolve({
      repository: new MemoryProviderKeyRepository(),
      userIds: [sampleAccount().id, sampleAccount().id],
    }),
  );
});
