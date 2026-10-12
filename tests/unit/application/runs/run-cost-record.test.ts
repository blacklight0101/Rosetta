import { describe, expect, it } from 'vitest';
import { ManifestCostRecorder } from '../../../../src/application/runs/run-cost-record.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { runningRun, sampleManifest } from '../../../support/run-fixtures.js';

// RF-421, RF-1010, data-model.md sections 3.6 and 4 (`runs`): after each metered call the run's
// manifest totals and the running totals of its row grow by the call's tokens and cost. One
// recorder serves every provider of a run and its updates run one after another.

const call = { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 1024, costMicros: 40n };

async function setUp(): Promise<{
  readonly recorder: ManifestCostRecorder;
  readonly manifests: MemoryRunManifestStore;
  readonly runs: MemoryRunIndex;
  readonly runId: string;
}> {
  const run = runningRun({ stage: 'understand', runKey: '20261012-100000-understand' });
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  const manifests = new MemoryRunManifestStore();
  const scope = { id: run.id, userId: run.userId, projectId: run.projectId, runKey: run.runKey };
  await manifests.write(scope, sampleManifest({ runId: run.runKey, stage: 'understand' }));
  return {
    recorder: new ManifestCostRecorder({ manifests, runs, scope }),
    manifests,
    runs,
    runId: run.id,
  };
}

describe('ManifestCostRecorder', () => {
  it('RF-421 adds each call to the manifest totals and the run row totals', async () => {
    const { recorder, manifests, runs, runId } = await setUp();

    await recorder.addCall(call);
    await recorder.addCall({ ...call, costMicros: 2n });

    const manifest = await manifests.read({
      id: runId,
      userId: '00000000-0000-4000-9000-000000000001',
      projectId: '00000000-0000-4000-a000-000000000001',
      runKey: '20261012-100000-understand',
    });
    expect(manifest?.totals).toEqual({
      inputTokens: 2400,
      outputTokens: 160,
      cachedInputTokens: 2048,
      costMicros: 42,
      calls: 2,
    });
    const row = await runs.find('00000000-0000-4000-9000-000000000001', runId);
    expect(row?.totals).toEqual({
      inputTokens: 2400,
      outputTokens: 160,
      cachedInputTokens: 2048,
      costMicros: 42,
    });
  });

  it('RF-421 loses no call when parallel tasks record at the same time', async () => {
    const { recorder, runs, runId } = await setUp();

    await Promise.all(Array.from({ length: 6 }, () => recorder.addCall(call)));

    expect(
      (await runs.find('00000000-0000-4000-9000-000000000001', runId))?.totals.costMicros,
    ).toBe(240);
  });
});
