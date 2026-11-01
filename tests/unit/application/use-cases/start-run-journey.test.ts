import { describe, expect, it } from 'vitest';
import { StartRun } from '../../../../src/application/use-cases/start-run.js';
import { journeyRemaining, journeySpend } from '../../../../src/domain/journey/journey-record.js';
import { MemoryJourneyRecords } from '../../../../src/infrastructure/db/memory-journey-records.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { journeyOf, serverJourney } from '../../../support/journey-lookups.js';
import { MemoryBriefStore } from '../../../support/memory-brief-store.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';
import { ALL_KEYS_SERVED } from '../../../support/web-role-keys.js';

// RF-011, RF-434, RF-435, RF-1105, ADR-027: pressing Analyse records the journey with the server's
// worst-case total; every later step runs under what is left of that one amount, and another
// user's project has no journey.

const fake = settingsFor({
  reader: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'fake', model: 'fake-model' },
  verifier: { provider: 'fake', model: 'judge-model' },
});
const worst = serverJourney.worstCase;

async function setup() {
  const harness = createRunHarness();
  const projects = new MemoryProjectRepository();
  const project = sampleProject({ userId: userAmy.userId, settings: fake });
  await projects.insertOrFind(project);
  const journeys = new MemoryJourneyRecords();
  const startRun = new StartRun({
    journey: journeyOf(serverJourney),
    roleKeys: ALL_KEYS_SERVED,
    ...{ projects, journeys, runs: harness.runs, manifests: harness.manifests },
    ...{ briefs: new MemoryBriefStore(), submit: harness.submit },
  });
  const analyse = () =>
    startRun.execute({
      ...{ actor: userAmy, projectId: project.id, stage: 'understand' },
      approvedAmount: { tokens: worst.tokens, costMicros: worst.costMicros },
    });
  return { harness, project, journeys, startRun, analyse };
}

describe('the journey of a project', () => {
  it('RF-011 Analyse records the journey with the worst-case total', async () => {
    const { project, journeys, analyse } = await setup();

    const started = await analyse();

    expect(started.ok).toBe(true);
    const record = await journeys.find(userAmy.userId, project.id);
    expect(record?.approved).toEqual({ tokens: worst.tokens, costMicros: worst.costMicros });
    expect(record?.createdAt).toBe(started.ok ? started.value.run.queuedAt : -1);
  });

  it('RF-435 a later step with no figure of its own runs under what is left of the amount', async () => {
    const { harness, project, startRun, analyse } = await setup();
    const first = await analyse();
    if (!first.ok) throw new Error('Analyse was refused.');
    await harness.runs.recordTotals(first.value.run.id, {
      ...{ costMicros: 0, inputTokens: 1_000_000, outputTokens: 400_000 },
      cachedInputTokens: 0,
    });

    const next = await startRun.execute({
      ...{ actor: userAmy, projectId: project.id, stage: 'understand' },
    });

    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(next.value.run));
    expect(manifest?.options['approvedAmount']).toEqual({
      tokens: worst.tokens - 1_400_000,
      costMicros: 0,
    });
  });
});

describe('the spend of a journey', () => {
  it('RF-435 the spend of the steps is checked against the one amount, never below zero', () => {
    const record = {
      ...{ userId: 'u', projectId: 'p', createdAt: 1_000 },
      approved: { tokens: 100, costMicros: 50 },
    };
    const step = (id: string, queuedAt: number, stage: 'understand' | 'scan') =>
      sampleRun({
        ...{ id, projectId: 'p', stage, queuedAt },
        totals: { costMicros: 40, inputTokens: 60, outputTokens: 20, cachedInputTokens: 0 },
      });
    const runs = [
      step('a', 1_000, 'understand'),
      step('b', 2_000, 'understand'),
      step('c', 3_000, 'scan'),
    ];

    expect(journeySpend(record, runs)).toEqual({ tokens: 160, costMicros: 80 });
    expect(journeyRemaining(record, runs)).toEqual({ tokens: 0, costMicros: 0 });
  });
});

describe('the journey of another user', () => {
  it('RF-1105 another user finds no journey of the project', async () => {
    const { project, journeys, analyse } = await setup();
    await analyse();

    expect(await journeys.find(userBob.userId, project.id)).toBeUndefined();
    await expect(
      journeys.save({
        ...{ userId: userBob.userId, projectId: project.id, createdAt: 1 },
        approved: { tokens: 1, costMicros: 1 },
      }),
    ).rejects.toMatchObject({ code: 'RST-2003' });
    expect((await journeys.find(userAmy.userId, project.id))?.approved).toEqual({
      tokens: worst.tokens,
      costMicros: worst.costMicros,
    });
  });
});
