import type { CachedSnapshot, SnapshotCache } from '../../src/application/ports/snapshot-cache.js';

// RF-1012: a SnapshotCache over snapshots kept in memory, for tests of the layers above it.

function newestFirst(left: CachedSnapshot, right: CachedSnapshot): number {
  if (left.repository !== right.repository) return left.repository < right.repository ? -1 : 1;
  if (left.downloadedAt !== right.downloadedAt)
    return left.downloadedAt < right.downloadedAt ? 1 : -1;
  return left.key < right.key ? -1 : 1;
}

export class MemorySnapshotCache implements SnapshotCache {
  readonly removals: string[] = [];
  private readonly snapshots = new Map<string, CachedSnapshot>();

  add(snapshot: CachedSnapshot): void {
    this.snapshots.set(snapshot.key, snapshot);
  }

  list(): Promise<readonly CachedSnapshot[]> {
    return Promise.resolve([...this.snapshots.values()].sort(newestFirst));
  }

  remove(key: string): Promise<boolean> {
    this.removals.push(key);
    return Promise.resolve(this.snapshots.delete(key));
  }
}
