import { describe } from 'vitest';
import { MemoryCostLedger } from '../../../../src/infrastructure/db/memory-cost-ledger.js';
import { costLedgerContract } from '../../../contracts/cost-ledger.contract.js';
import { costLedgerRoleContract } from '../../../contracts/cost-ledger-roles.contract.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// Architecture section 7: the memory cost ledger of the unit tests passes the same contract as
// PgCostLedger (ADR-008).
describe('MemoryCostLedger', () => {
  costLedgerContract('MemoryCostLedger', () => {
    const ids = new SequenceIdGenerator();
    return Promise.resolve({
      ledger: new MemoryCostLedger(),
      addUser: () => Promise.resolve(ids.uuid()),
      newRunId: () => ids.uuid(),
    });
  });
});

describe('MemoryCostLedger roles', () => {
  costLedgerRoleContract('MemoryCostLedger', () => {
    const ids = new SequenceIdGenerator();
    return Promise.resolve({
      ledger: new MemoryCostLedger(),
      addUser: () => Promise.resolve(ids.uuid()),
      newRunId: () => ids.uuid(),
    });
  });
});
