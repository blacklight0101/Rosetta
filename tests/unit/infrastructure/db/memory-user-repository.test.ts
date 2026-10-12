import { describe } from 'vitest';
import { MemoryUserRepository } from '../../../../src/infrastructure/db/memory-user-repository.js';
import { userRepositoryContract } from '../../../contracts/user-repository.contract.js';

// Architecture section 7: the memory adapter passes the same contract as PgUserRepository.
describe('MemoryUserRepository', () => {
  userRepositoryContract('MemoryUserRepository', () => Promise.resolve(new MemoryUserRepository()));
});
