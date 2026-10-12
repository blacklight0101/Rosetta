import { describe } from 'vitest';
import { MemoryAccountUsage } from '../../../../src/infrastructure/db/memory-account-usage.js';
import { accountUsageContract } from '../../../contracts/account-usage.contract.js';
import { newId } from '../../../support/db-rows.js';

// Architecture section 7: the memory adapter passes the same contract as PgAccountUsage.
describe('MemoryAccountUsage', () => {
  accountUsageContract('MemoryAccountUsage', () => {
    const usage = new MemoryAccountUsage();
    return Promise.resolve({
      usage,
      addUser: () => Promise.resolve(newId()),
      addProject: (userId) => {
        usage.addProject(userId);
        return Promise.resolve();
      },
      addCost: (userId, row) => {
        usage.addCost({
          userId,
          at: row.at,
          costMicros: row.costMicros,
          currency: row.currency ?? 'USD',
        });
        return Promise.resolve();
      },
    });
  });
});
