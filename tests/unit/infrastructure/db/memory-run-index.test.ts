import { describe } from 'vitest';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { runIndexOverviewContract } from '../../../contracts/run-index-overview.contract.js';
import { runIndexContract } from '../../../contracts/run-index.contract.js';

// Architecture section 7: the memory adapter passes the same contract as the PostgreSQL one.
describe('MemoryRunIndex', () => {
  runIndexContract('MemoryRunIndex', () => Promise.resolve(new MemoryRunIndex()));
  runIndexOverviewContract('MemoryRunIndex', () => Promise.resolve(new MemoryRunIndex()));
});
