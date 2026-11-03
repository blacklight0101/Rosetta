import { describe, expect, it } from 'vitest';
import { EstimateDeepen } from '../../../../src/application/estimate/deepen-estimate.js';
import { NO_LISTED_MODELS } from '../../../../src/application/models/model-list.js';
import type { TaskResults } from '../../../../src/application/ports/task-results.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import { MemoryJourneyRecords } from '../../../../src/infrastructure/db/memory-journey-records.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryProviderKeyRepository } from '../../../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { cardOf, claimOf, coverageOf, deepenFiles } from '../../../support/deepen-fixtures.js';
import { estimatePrices, FixedScans, projectWithScan } from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-434, RF-209, DEC-205, DEC-206, P8-24: the Deepen estimate of a project with a journey is held to
// what is left of the approved amount, not to the project run cap, and says so, so the page shows
// one amount.

const areas: readonly Area[] = [
  {
    name: 'src',
    files: ['src/a.cs', 'src/b.cs'],
    estimatedTokens: 450,
    mapLevel: 'coarse',
    origin: 'folder',
  },
];

const results: TaskResults = {
  read: () =>
    Promise.resolve([
      {
        agentTaskId: 'reader-001',
        area: 'src',
        state: 'Done',
        turns: 3,
        withoutCards: false,
        cards: [cardOf('src', [claimOf('BR-001.c1', 'Unverified', ['src/a.cs'])])],
        coverage: coverageOf('src', [
          { path: 'src/a.cs', read: 2 },
          { path: 'src/b.cs', read: 0 },
        ]),
      },
    ]),
  write: () => Promise.resolve(),
  readConsolidation: () => Promise.resolve({ types: [], merges: [] }),
  writeConsolidation: () => Promise.resolve(),
};

const noAnswers = {
  answers: { answeredQuestions: () => Promise.resolve([]) },
  priorCards: { cardsOf: () => Promise.resolve([]), markAnswered: () => Promise.resolve([]) },
};

async function estimateWith(approved: { tokens: number; costMicros: number } | undefined) {
  const settings = settingsFor({
    reader: { provider: 'openai', model: 'priced-model' },
    verifier: { provider: 'openai', model: 'priced-model' },
    summariser: { provider: 'openai', model: 'priced-model' },
  });
  const projects = new MemoryProjectRepository();
  const runs = new MemoryRunIndex();
  const journeys = new MemoryJourneyRecords();
  const project = await projectWithScan({ projects, runs }, userAmy.userId, settings);
  const understand = sampleRun({
    projectId: project.id,
    userId: userAmy.userId,
    stage: 'understand',
    queueState: 'Ended',
    endState: 'Completed',
    queuedAt: 1000,
    totals: {
      inputTokens: 50_000,
      outputTokens: 10_000,
      cachedInputTokens: 0,
      costMicros: 40_000,
    },
  });
  await runs.insert(understand);
  if (approved !== undefined) {
    await journeys.save({
      userId: userAmy.userId,
      projectId: project.id,
      approved,
      createdAt: 500,
    });
  }
  const estimate = new EstimateDeepen({
    ...{ projects, runs, journeys, taskResults: results, ...noAnswers },
    scans: new FixedScans(areas, deepenFiles),
    keys: new MemoryProviderKeyRepository(),
    priceTable: estimatePrices,
    models: NO_LISTED_MODELS,
  });
  const outcome = await estimate.execute({ actor: userAmy, runId: understand.id });
  if (!outcome.ok) throw new Error(`The estimate was refused with ${outcome.error}`);
  return outcome.value;
}

describe('RF-434 the Deepen estimate under the approved amount', () => {
  it('RF-434 DEC-206 holds the estimate to what is left of the approved amount and names both figures', async () => {
    const estimate = await estimateWith({ tokens: 4_000_000, costMicros: 4_000_000 });

    expect(estimate.journey).toEqual({
      approvedMicros: 4_000_000,
      remainingMicros: 3_960_000,
      approvedTokens: 4_000_000,
      remainingTokens: 3_940_000,
    });
    expect(estimate.cap).toEqual({ maxCostMicros: 3_960_000, maxTokens: 3_940_000 });
  });

  it('RF-434 warns against the amount that is left, not the project run cap', async () => {
    const estimate = await estimateWith({ tokens: 200_000, costMicros: 100_000 });

    expect(estimate.cap.maxCostMicros).toBe(60_000);
    expect(estimate.overCap.allRounds).toBe(true);
  });

  it('RF-434 keeps the project run cap and gives no journey for a project without one', async () => {
    const estimate = await estimateWith(undefined);

    expect(estimate.journey).toBeUndefined();
    expect(estimate.cap.maxCostMicros).toBeGreaterThan(0);
  });
});
