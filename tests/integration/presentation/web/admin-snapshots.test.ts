import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  completedCommit,
  completedSnapshot,
  createHistoryHarness,
  type HistoryHarness,
} from '../../../support/history-harness.js';
import { sampleCachedSnapshot, snapshotSha } from '../../../support/snapshot-listing-fixtures.js';

// RF-1012, RF-1105: GET /api/admin/snapshots and DELETE /api/admin/snapshots/:key are the
// administrator's: the list shows each snapshot with its size, the runs that use it and its last
// use, and a snapshot that a run in progress uses cannot be deleted.

let harness: HistoryHarness | undefined;

afterEach(async () => {
  await harness?.test.server.close();
  harness = undefined;
});

const unusedKey = `octo__demo@${snapshotSha}`;
const keyUrl = (key: string): string => `/api/admin/snapshots/${encodeURIComponent(key)}`;

/** The webforms snapshot of amy's runs (one ended, one in progress) and one nobody uses. */
async function setup(): Promise<HistoryHarness> {
  harness = await createHistoryHarness();
  const { test } = harness;
  test.snapshots.add(
    sampleCachedSnapshot({
      ...{ key: completedSnapshot, repository: 'octo/webforms', commitSha: completedCommit },
      ...{ fileCount: 12, totalBytes: 2048 },
    }),
  );
  test.snapshots.add(sampleCachedSnapshot({ key: unusedKey, totalBytes: 18_400_000 }));
  return harness;
}

describe('GET /api/admin/snapshots', () => {
  it('RF-1012 lists each snapshot with its size, the runs that use it, those in progress and its last use', async () => {
    const { root } = await setup();

    const response = await root.request({ method: 'GET', url: '/api/admin/snapshots' });

    expect(response.statusCode).toBe(200);
    const { snapshots } = response.json<{ snapshots: unknown[] }>();
    expect(snapshots).toEqual([
      {
        ...{ key: unusedKey, repository: 'octo/demo', commitSha: snapshotSha },
        ...{ downloadedAt: '2026-10-11T09:11:00.000Z', fileCount: 412, sizeBytes: 18_400_000 },
        ...{ runs: 0, activeRuns: 0, lastUsedAt: null },
      },
      {
        ...{ key: completedSnapshot, repository: 'octo/webforms', commitSha: completedCommit },
        ...{ downloadedAt: '2026-10-11T09:11:00.000Z', fileCount: 12, sizeBytes: 2048 },
        ...{ runs: 1, activeRuns: 0, lastUsedAt: '2026-10-11T09:00:00.000Z' },
      },
    ]);
  });

  it('RF-1102 answers a user who is not the administrator with 403 and shows no snapshot', async () => {
    const { amy } = await setup();

    const response = await amy.request({ method: 'GET', url: '/api/admin/snapshots' });

    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain('octo/demo');
  });
});

describe('DELETE /api/admin/snapshots/:key', () => {
  it('RF-1012 removes an unused snapshot, answers the space freed and writes an info entry', async () => {
    const { test, root } = await setup();

    const response = await root.request({ method: 'DELETE', url: keyUrl(unusedKey) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ freedBytes: 18_400_000 });
    expect(test.snapshots.removals).toEqual([unusedKey]);
    const entry = test.logger.entries.find((candidate) => candidate.logger === 'history');
    expect(entry).toMatchObject({ data: { snapshot: unusedKey, freedBytes: 18_400_000 } });
  });

  it('RF-1012 refuses a snapshot that a run in progress uses with 409', async () => {
    const { test, root, live } = await setup();
    const source = { commitSha: completedCommit, snapshotKey: completedSnapshot };
    await test.runs.runs.recordSource(live.id, source);

    const response = await root.request({ method: 'DELETE', url: keyUrl(completedSnapshot) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.deleteRefusedInUse });
    expect(test.snapshots.removals).toEqual([]);
  });
});

describe('DELETE /api/admin/snapshots/:key refusals', () => {
  it('RF-1012 answers 404 for a key that names no snapshot or that is not a snapshot key', async () => {
    const { test, root } = await setup();

    for (const key of ['octo__none@x', '..%2F..%2Fetc', '%2E%2E']) {
      const response = await root.request({ method: 'DELETE', url: `/api/admin/snapshots/${key}` });
      expect(response.statusCode).toBe(404);
    }
    expect(test.snapshots.removals).toEqual([]);
  });

  it('RF-1102 answers a user who is not the administrator with 403 and removes nothing', async () => {
    const { test, amy } = await setup();

    const response = await amy.request({ method: 'DELETE', url: keyUrl(unusedKey) });

    expect(response.statusCode).toBe(403);
    expect(test.snapshots.removals).toEqual([]);
  });
});
