import { describe } from 'vitest';
import { MemoryUserRepository } from '../../../../src/infrastructure/db/memory-user-repository.js';
import { failedSignInCounterContract } from '../../../contracts/failed-sign-in-counter.contract.js';
import { userRepositoryContract } from '../../../contracts/user-repository.contract.js';

// Architecture section 7: the memory adapter passes the same contracts as PgUserRepository.
describe('MemoryUserRepository', () => {
  const fresh = () => Promise.resolve(new MemoryUserRepository());

  userRepositoryContract('MemoryUserRepository', fresh);
  failedSignInCounterContract('MemoryUserRepository', fresh);
});
