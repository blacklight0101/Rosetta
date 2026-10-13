import { describe } from 'vitest';
import { snapshotCacheContract } from '../../../contracts/snapshot-cache.contract.js';
import { workspaceFoldersContract } from '../../../contracts/workspace-folders.contract.js';
import { MemorySnapshotCache } from '../../../support/memory-snapshot-cache.js';
import { MemoryWorkspaceFolders } from '../../../support/memory-workspace-folders.js';

// Architecture section 7: the memory fakes pass the same contracts as the file adapters.
describe('MemoryWorkspaceFolders', () => {
  workspaceFoldersContract('MemoryWorkspaceFolders', () => {
    const folders = new MemoryWorkspaceFolders();
    return Promise.resolve({
      folders,
      seed: (target, files) => {
        folders.seed(target, files);
        return Promise.resolve();
      },
    });
  });
});

describe('MemorySnapshotCache', () => {
  snapshotCacheContract('MemorySnapshotCache', () => {
    const cache = new MemorySnapshotCache();
    return Promise.resolve({
      cache,
      add: (snapshot) => {
        cache.add(snapshot);
        return Promise.resolve();
      },
    });
  });
});
