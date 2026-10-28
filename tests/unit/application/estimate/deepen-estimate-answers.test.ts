import { describe, expect, it } from 'vitest';
import { EstimateDeepen } from '../../../../src/application/estimate/deepen-estimate.js';
import { NO_LISTED_MODELS } from '../../../../src/application/models/model-list.js';
import type { AnsweredQuestion } from '../../../../src/application/ports/answers-file.js';
import type { PriorCard } from '../../../../src/application/ports/prior-cards.js';
import type { TaskResult, TaskResults } from '../../../../src/application/ports/task-results.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryProviderKeyRepository } from '../../../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { cardOf, claimOf, coverageOf, deepenFiles } from '../../../support/deepen-fixtures.js';
import { estimatePrices, FixedScans, projectWithScan } from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-209, DEC-179: the estimate before a Deepen says how many answers of the project the first
// round would use: the answered questions of the areas its tasks read. A question that is already
// `Answered` or belongs to an area the round does not read is not counted.

const areas: readonly Area[] = [
  {
    name: 'src',
    files: ['src/a.cs', 'src/b.cs', 'src/c.cs'],
    estimatedTokens: 450,
    mapLevel: 'coarse',
    origin: 'folder',
  },
  { name: 'docs', files: [], estimatedTokens: 0, mapLevel: 'coarse', origin: 'folder' },
];

const result: TaskResult = {
  agentTaskId: 'reader-001',
  area: 'src',
  state: 'Done',
  turns: 3,
  withoutCards: false,
  cards: [cardOf('src', [claimOf('BR-001.c1', 'Rejected', ['src/c.cs'])])],
  coverage: coverageOf('src', [
    { path: 'src/a.cs', read: 2 },
    { path: 'src/b.cs', read: 2 },
    { path: 'src/c.cs', read: 2 },
  ]),
};

const results: TaskResults = {
  read: () => Promise.resolve([result]),
  write: () => Promise.resolve(),
  readConsolidation: () => Promise.resolve({ types: [], merges: [] }),
  writeConsolidation: () => Promise.resolve(),
};

const runKey = '20261012-100000-understand';
const answered = (cardId: string): AnsweredQuestion => ({
  ...{ cardId, runKey, question: `Question ${cardId}?`, context: 'src/a.cs:1-2 x' },
  answer: 'Staff only.',
});
const oq = (id: string, area: string, state: 'Open' | 'Answered'): PriorCard => ({
  ...{ id, type: 'OQ', title: 'A question', area, claims: [] },
  ...{ question: `Question ${id}?`, questionState: state },
});

async function answersOf(asked: readonly AnsweredQuestion[], cards: readonly PriorCard[]) {
  const projects = new MemoryProjectRepository();
  const runs = new MemoryRunIndex();
  const settings = settingsFor({
    reader: { provider: 'openai', model: 'priced-model' },
    verifier: { provider: 'openai', model: 'priced-model' },
    summariser: { provider: 'openai', model: 'priced-model' },
  });
  const project = await projectWithScan({ projects, runs }, userAmy.userId, settings);
  const understand = sampleRun({
    ...{ projectId: project.id, userId: userAmy.userId, stage: 'understand' },
    ...{ queueState: 'Ended', endState: 'Completed' },
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
    answers: { answeredQuestions: () => Promise.resolve(asked) },
    priorCards: { cardsOf: () => Promise.resolve(cards), markAnswered: () => Promise.resolve([]) },
  });
  const outcome = await estimate.execute({
    actor: userAmy,
    runId: understand.id,
    coveragePass: false,
  });
  if (!outcome.ok) throw new Error(`The estimate was refused with ${outcome.error}`);
  return outcome.value.plan.answers;
}

describe('RF-209 the answers the estimate of a Deepen says it uses', () => {
  it('RF-209 counts the answered questions of the areas the first round reads', async () => {
    const asked = [answered('OQ-001'), answered('OQ-002')];

    expect(await answersOf(asked, [oq('OQ-001', 'src', 'Open'), oq('OQ-002', 'src', 'Open')])).toBe(
      2,
    );
  });

  it('RF-209 leaves out a question of an area no task reads and one already Answered', async () => {
    const asked = [answered('OQ-001'), answered('OQ-002'), answered('OQ-003')];
    const cards = [
      oq('OQ-001', 'src', 'Open'),
      oq('OQ-002', 'docs', 'Open'),
      oq('OQ-003', 'src', 'Answered'),
    ];

    expect(await answersOf(asked, cards)).toBe(1);
  });

  it('RF-209 counts none when the project has no answered question', async () => {
    expect(await answersOf([], [])).toBe(0);
  });
});
