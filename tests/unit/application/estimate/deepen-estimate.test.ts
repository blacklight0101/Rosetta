import { NO_LISTED_MODELS } from '../../../../src/application/models/model-list.js';
import { describe, expect, it } from 'vitest';
import {
  MERGE_ANSWER_TOKENS,
  MERGE_PROMPT_TOKENS,
} from '../../../../src/application/consolidate/merge-request.js';
import { EstimateDeepen } from '../../../../src/application/estimate/deepen-estimate.js';
import type { TaskResult, TaskResults } from '../../../../src/application/ports/task-results.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import {
  cardOf,
  claimOf,
  coverageOf,
  deepenFiles,
  libraryPath,
} from '../../../support/deepen-fixtures.js';
import { estimatePrices, FixedScans, projectWithScan } from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy, userBob } from '../../../support/run-harness.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryProviderKeyRepository } from '../../../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';

// RF-209, RF-425, DEC-145: the estimate before a Deepen. The completed run has one Unverified claim,
// one rejected first-party claim, one rejected claim citing only a library, and one first-party file
// (src/b.cs, 300 tokens) no task read.

const areas: readonly Area[] = [
  {
    name: 'src',
    files: ['src/a.cs', 'src/b.cs', 'src/c.cs'],
    estimatedTokens: 450,
    mapLevel: 'coarse',
    origin: 'folder',
  },
];

const result: TaskResult = {
  agentTaskId: 'reader-001',
  area: 'src',
  state: 'Done',
  turns: 3,
  withoutCards: false,
  cards: [
    cardOf('src', [
      claimOf('BR-001.c1', 'Unverified', ['src/a.cs']),
      claimOf('BR-001.c2', 'Rejected', ['src/c.cs']),
      claimOf('BR-001.c3', 'Rejected', [libraryPath]),
    ]),
  ],
  coverage: coverageOf('src', [
    { path: 'src/a.cs', read: 2 },
    { path: 'src/b.cs', read: 0 },
    { path: 'src/c.cs', read: 2 },
  ]),
};

const results: TaskResults = {
  read: () => Promise.resolve([result]),
  write: () => Promise.resolve(),
  readConsolidation: () => Promise.resolve({ types: [], merges: [] }),
  writeConsolidation: () => Promise.resolve(),
};

function cloudWithCap(maxTokens?: number): ProjectSettings {
  const settings = settingsFor({
    reader: { provider: 'openai', model: 'priced-model' },
    verifier: { provider: 'openai', model: 'priced-model' },
    summariser: { provider: 'openai', model: 'priced-model' },
  });
  if (maxTokens === undefined) return settings;
  // The cost cap is out of the way, so only the token cap is compared (Q-57: a hosted model now
  // defaults to a larger output limit, which raises the cost of the high figure).
  const run = { maxCostMicros: 100_000_000, maxTokens };
  return { ...settings, budget: { ...settings.budget, run } };
}

async function harnessOf(settings: ProjectSettings, run: Partial<Run> = {}) {
  const projects = new MemoryProjectRepository();
  const runs = new MemoryRunIndex();
  const project = await projectWithScan({ projects, runs }, userAmy.userId, settings);
  const understand = sampleRun({
    projectId: project.id,
    userId: userAmy.userId,
    stage: 'understand',
    queueState: 'Ended',
    endState: 'Completed',
    ...run,
  });
  await runs.insert(understand);
  const estimate = new EstimateDeepen({
    projects,
    runs,
    scans: new FixedScans(areas, deepenFiles),
    taskResults: results,
    keys: new MemoryProviderKeyRepository(),
    priceTable: estimatePrices,
    models: NO_LISTED_MODELS,
  });
  return { estimate, runs, understand };
}

async function estimateOf(settings: ProjectSettings, maxRounds?: number) {
  const { estimate, understand } = await harnessOf(settings);
  const outcome = await estimate.execute({ actor: userAmy, runId: understand.id, maxRounds });
  if (!outcome.ok) throw new Error(`The estimate was refused with ${outcome.error}`);
  return outcome.value;
}

describe('RF-209 the estimate before a Deepen', () => {
  it('RF-209 plans the first round from the completed run: judge, re-read, out of scope, unread files', async () => {
    const estimate = await estimateOf(cloudWithCap());

    expect(estimate.plan).toEqual({
      judge: 1,
      reread: 1,
      outOfScope: 1,
      failedAreas: 0,
      // EV-04: files read in part count with the tokens of their unread lines.
      unreadFiles: 3,
      unreadTokens: 446,
    });
    expect(estimate.roles.map((role) => role.role)).toEqual(['reader', 'verifier', 'summariser']);
    expect(estimate).toMatchObject({ maxRounds: 3, coveragePass: true, currency: 'USD' });
  });

  it('RF-209 gives the most all rounds can cost as the first round times the round limit', async () => {
    const estimate = await estimateOf(cloudWithCap(), 4);

    expect(estimate.allRounds.high.inputTokens).toBe(estimate.round.high.inputTokens * 4);
    expect(estimate.allRounds.likely.outputTokens).toBe(estimate.round.likely.outputTokens * 4);
    expect(estimate.allRounds.low.costMicros).toBe(estimate.round.low.costMicros * 4n);
    expect(estimate.round.high.costMicros).toBeGreaterThan(0n);
  });

  it('RF-209 compares the round and all rounds with the run cap', async () => {
    const first = await estimateOf(cloudWithCap(), 3);
    const roundTokens = first.round.high.inputTokens + first.round.high.outputTokens;

    const estimate = await estimateOf(cloudWithCap(roundTokens * 2), 3);

    expect(estimate.overCap).toEqual({ round: false, allRounds: true });
    expect(estimate.cap.maxTokens).toBe(roundTokens * 2);
  });
});

describe('RF-250 the summariser calls in the estimate before a Deepen (Q-52)', () => {
  it('RF-250 counts the merge calls of the end of the Deepen: the prompt and an answer for each', async () => {
    const estimate = await estimateOf(cloudWithCap());

    const summariser = estimate.roles.find((role) => role.role === 'summariser');
    const merges = { low: 1, likely: 2, high: 4 };
    for (const scenario of ['low', 'likely', 'high'] as const) {
      const point = summariser?.points[scenario];
      expect(point?.outputTokens).toBeGreaterThanOrEqual(merges[scenario] * MERGE_ANSWER_TOKENS);
      expect(point?.inputTokens).toBeGreaterThanOrEqual(merges[scenario] * MERGE_PROMPT_TOKENS);
    }
  });
});

describe('RF-209 an estimate the server refuses', () => {
  it('RF-1105 answers another user asking as if the run did not exist', async () => {
    const { estimate, understand } = await harnessOf(cloudWithCap());

    expect(await estimate.execute({ actor: userBob, runId: understand.id })).toEqual({
      ok: false,
      error: ERROR_CODES.notFound,
    });
  });

  it.each([
    ['a scan', { stage: 'scan' as const }],
    ['a run that did not complete', { endState: 'Failed' as const }],
  ])('RF-209 refuses %s', async (_name, run) => {
    const { estimate, understand } = await harnessOf(cloudWithCap(), run);

    expect(await estimate.execute({ actor: userAmy, runId: understand.id })).toEqual({
      ok: false,
      error: ERROR_CODES.runNotDeepenable,
    });
  });

  it.each([0, 6])('RF-209 refuses a round limit of %i and creates no run', async (maxRounds) => {
    const { estimate, runs, understand } = await harnessOf(cloudWithCap());

    expect(await estimate.execute({ actor: userAmy, runId: understand.id, maxRounds })).toEqual({
      ok: false,
      error: ERROR_CODES.requestInvalid,
    });
    expect(await runs.list(userAmy.userId, understand.projectId)).toHaveLength(2);
  });
});
