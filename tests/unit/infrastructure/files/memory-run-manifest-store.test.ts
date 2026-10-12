import { describe } from 'vitest';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { runManifestStoreContract } from '../../../contracts/run-manifest-store.contract.js';

// Architecture section 7: the memory store passes the same contract as the file store.
describe('MemoryRunManifestStore', () => {
  runManifestStoreContract('MemoryRunManifestStore', () =>
    Promise.resolve(new MemoryRunManifestStore()),
  );
});
