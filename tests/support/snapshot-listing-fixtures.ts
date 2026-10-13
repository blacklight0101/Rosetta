import type { CachedSnapshot } from '../../src/application/ports/snapshot-cache.js';

// RF-1012: a valid cached snapshot of tests; a test overrides what it needs.

export const snapshotSha = 'a'.repeat(40);

export function sampleCachedSnapshot(overrides: Partial<CachedSnapshot> = {}): CachedSnapshot {
  return {
    key: `octo__demo@${snapshotSha}`,
    repository: 'octo/demo',
    commitSha: snapshotSha,
    downloadedAt: '2026-10-11T09:11:00.000Z',
    fileCount: 412,
    totalBytes: 18_400_000,
    ...overrides,
  };
}
