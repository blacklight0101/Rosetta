// RF-1008, RF-1012, P1-40: answers of the history and snapshot routes for the page tests (the shapes
// of src/presentation/web/history-routes.ts).

const sha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const olderSha = '0f1e2d3c4b5a69788796a5b4c3d2e1f001122334';

const totals = (costMicros: number, inputTokens: number, outputTokens: number) => ({
  costMicros,
  inputTokens,
  outputTokens,
  cachedInputTokens: 0,
});

export const liveKey = '20261011-091204-understand';
export const scanKey = '20261011-091150-scan';
export const capKey = '20261010-201533-understand';
export const doneKey = '20261009-184012-understand';

/** Four runs, newest first: one in progress, a scan, a run stopped by its cap and a finished one. */
export const history = {
  project: {
    id: 'p-1',
    name: 'octo/webforms',
    sourceUrl: 'https://github.com/octo/webforms',
    ref: '',
    subpath: '',
    folder: 'projects/p-1',
    sizeBytes: 7_800_000,
  },
  runs: [
    {
      ...{ id: 'r-4', runId: liveKey, stage: 'understand', queueState: 'Running', endState: null },
      ...{ commitSha: sha, queuedAt: '2026-10-11T09:12:03.000Z', endedAt: null },
      ...{ startedAt: '2026-10-11T09:12:04.000Z', totals: totals(410_000, 150_000, 46_102) },
      sizeBytes: 900_000,
    },
    {
      ...{ id: 'r-3', runId: scanKey, stage: 'scan', queueState: 'Ended', endState: 'Completed' },
      ...{ commitSha: sha, queuedAt: '2026-10-11T09:11:49.000Z', totals: totals(0, 0, 0) },
      ...{ startedAt: '2026-10-11T09:11:50.000Z', endedAt: '2026-10-11T09:11:58.000Z' },
      sizeBytes: 1200,
    },
    {
      ...{ id: 'r-2', runId: capKey, stage: 'understand', queueState: 'Ended' },
      ...{ endState: 'CapReached', commitSha: olderSha },
      ...{ totals: totals(2_160_000, 600_000, 93_410) },
      ...{ queuedAt: '2026-10-10T20:15:30.000Z', startedAt: '2026-10-10T20:15:33.000Z' },
      ...{ endedAt: '2026-10-10T20:40:00.000Z', sizeBytes: 3_700_000 },
    },
    {
      ...{ id: 'r-1', runId: doneKey, stage: 'understand', queueState: 'Ended' },
      ...{ endState: 'Completed', commitSha: olderSha },
      ...{ totals: totals(1_310_000, 380_000, 32_606) },
      ...{ queuedAt: '2026-10-09T18:40:10.000Z', startedAt: '2026-10-09T18:40:12.000Z' },
      ...{ endedAt: '2026-10-09T19:02:00.000Z', sizeBytes: 3_200_000 },
    },
  ],
};

/** The same project once no run is in progress. */
export const settledHistory = { ...history, runs: history.runs.slice(1) };

export const webformsSnapshot = {
  ...{ key: `octo__webforms@${sha}`, repository: 'octo/webforms', commitSha: sha },
  ...{ downloadedAt: '2026-10-11T09:11:00.000Z', fileCount: 412, sizeBytes: 18_400_000 },
  ...{ runs: 3, activeRuns: 1, lastUsedAt: '2026-10-11T09:12:04.000Z' },
};

export const olderSnapshot = {
  ...{ key: `octo__webforms@${olderSha}`, repository: 'octo/webforms', commitSha: olderSha },
  ...{ downloadedAt: '2026-10-09T18:40:00.000Z', fileCount: 409, sizeBytes: 18_100_000 },
  ...{ runs: 1, activeRuns: 0, lastUsedAt: '2026-10-09T19:02:00.000Z' },
};

export const unusedSnapshot = {
  ...{ key: `octo__demo@${olderSha}`, repository: 'octo/demo', commitSha: olderSha },
  ...{ downloadedAt: '2026-10-08T08:00:00.000Z', fileCount: 12, sizeBytes: 2048 },
  ...{ runs: 0, activeRuns: 0, lastUsedAt: null },
};
