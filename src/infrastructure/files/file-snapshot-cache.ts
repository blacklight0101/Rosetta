import type { CachedSnapshot, SnapshotCache } from '../../application/ports/snapshot-cache.js';

// RF-1012, data-model.md section 3.3: stub, replaced by the implementation in the next commit.

export class FileSnapshotCache implements SnapshotCache {
  constructor(dataDir: string) {
    void dataDir;
  }

  list(): Promise<readonly CachedSnapshot[]> {
    return Promise.resolve([]);
  }

  remove(key: string): Promise<boolean> {
    void key;
    return Promise.resolve(false);
  }
}
