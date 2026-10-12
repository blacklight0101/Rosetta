import { describe } from 'vitest';
import { MemoryCostTotals } from '../../../../src/infrastructure/db/memory-cost-totals.js';
import { costTotalsContract } from '../../../contracts/cost-totals.contract.js';
import { newId } from '../../../support/db-rows.js';

// Architecture section 7: the memory adapter passes the same contract as PgCostTotals.
describe('MemoryCostTotals', () => {
  costTotalsContract('MemoryCostTotals', () => {
    const totals = new MemoryCostTotals();
    return Promise.resolve({
      totals,
      addUser: () => Promise.resolve(newId()),
      add: (entry) => {
        totals.add(entry);
        return Promise.resolve();
      },
    });
  });
});
