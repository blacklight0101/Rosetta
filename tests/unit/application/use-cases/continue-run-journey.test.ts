import { describe, expect, it, vi } from 'vitest';
import { MAX_RUN_TOKENS } from '../../../../src/application/projects/project-settings.js';
import { readUnderstandOptions } from '../../../../src/application/understand/understand-options.js';
import { ContinueRun } from '../../../../src/application/use-cases/continue-run.js';
import { StartRun } from '../../../../src/application/use-cases/start-run.js';
import { ApprovalPause } from '../../../../src/domain/budget/cap-stop.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { journeyRemaining } from '../../../../src/domain/journey/journey-record.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryJourneyRecords } from '../../../../src/infrastructure/db/memory-journey-records.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { journeyOf, serverJourney } from '../../../support/journey-lookups.js';
import { MemoryBriefStore } from '../../../support/memory-brief-store.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { createRunHarness, userAmy, type RunHarness } from '../../../support/run-harness.js';
import { ALL_KEYS_SERVED } from '../../../support/web-role-keys.js';

// RF-432, RF-435, P9-01, EV-100: Continue (+N) at the approval pause of a journey step raises the
// journey's approved amount by the same N, so what is left of the journey grows with the run's line
// and the plan starts from Plan setup without a new Analyse. The journey never passes the
// administrator ceilings, and a run that is not a step of a journey grows alone, as before.

const fake = settingsFor({
  reader: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'fake', model: 'fake-model' },
  verifier: { provider: 'fake', model: 'judge-model' },
});
const worst = serverJourney.worstCase;
const extra = { tokens: 1_000_000, costMicros: 0 };

async function setup() {
  const harness = createRunHarness();
  const projects = new MemoryProjectRepository();
  const project = sampleProject({ userId: userAmy.userId, settings: fake });
  await projects.insertOrFind(project);
  const journeys = new MemoryJourneyRecords();
  const briefs = new MemoryBriefStore();
  await briefs.saveEmpty({ userId: userAmy.userId, projectId: project.id });
  const startRun = new StartRun({
    ...{ journey: journeyOf(serverJourney), roleKeys: ALL_KEYS_SERVED, briefs },
    ...{ projects, journeys, runs: harness.runs, manifests: harness.manifests },
    submit: harness.submit,
  });
  const { runs, manifests, queue, clock } = harness;
  const continueRun = new ContinueRun({ runs, manifests, queue, clock, journeys });
  return { harness, project, journeys, startRun, continueRun };
}

async function stateOf(h: RunHarness, run: Run, state: Run['queueState']): Promise<Run> {
  let latest: Run | undefined;
  await vi.waitFor(
    async () => {
      latest = await h.runs.find(run.userId, run.id);
      if (latest?.queueState !== state) throw new Error(`The run is not ${state}`);
    },
    { interval: 2, timeout: 20_000 },
  );
  if (latest === undefined) throw new Error('The run vanished');
  return latest;
}

/** Analyse, then the understand run spends its whole line and pauses at it. */
async function pausedStep(set: Awaited<ReturnType<typeof setup>>): Promise<Run> {
  const { harness, project, startRun } = set;
  const started = await startRun.execute({
    ...{ actor: userAmy, projectId: project.id, stage: 'understand' },
    approvedAmount: { tokens: worst.tokens, costMicros: worst.costMicros },
  });
  if (!started.ok) throw new Error('Analyse was refused.');
  const { run } = started.value;
  await harness.runs.recordTotals(run.id, {
    ...{ costMicros: 0, inputTokens: worst.tokens, outputTokens: 0 },
    cachedInputTokens: 0,
  });
  harness.executor.started[0]?.stop(new ApprovalPause());
  harness.executor.settle(run.id, { endState: 'Completed', unreadAreas: 1 });
  return stateOf(harness, run, 'AwaitingApproval');
}

async function approvedOf(h: RunHarness, run: Run) {
  const manifest = await h.manifests.read(h.scopeOf(run));
  return manifest === undefined
    ? undefined
    : readUnderstandOptions(manifest.options).approvedAmount;
}

async function remainderOf(set: Awaited<ReturnType<typeof setup>>) {
  const record = await set.journeys.find(userAmy.userId, set.project.id);
  if (record === undefined) throw new Error('No journey.');
  return journeyRemaining(record, await set.harness.runs.list(userAmy.userId, set.project.id));
}

describe('RF-432 Continue on a step of a journey', () => {
  it('RF-432 P9-01 raises the journey approved amount by the same N as the run', async () => {
    const set = await setup();
    const paused = await pausedStep(set);
    const before = await remainderOf(set);

    const continued = await set.continueRun.execute({ actor: userAmy, runId: paused.id, extra });

    expect(continued.ok).toBe(true);
    const record = await set.journeys.find(userAmy.userId, set.project.id);
    expect(record?.approved).toEqual({ tokens: worst.tokens + extra.tokens, costMicros: 0 });
    expect(await approvedOf(set.harness, paused)).toMatchObject({
      tokens: worst.tokens + extra.tokens,
    });
    expect(before).toEqual({ tokens: 0, costMicros: 0 });
    expect(await remainderOf(set)).toEqual({ tokens: before.tokens + extra.tokens, costMicros: 0 });
  });

  it('RF-435 P9-01 after the Continue the plan starts without a new Analyse', async () => {
    const set = await setup();
    const paused = await pausedStep(set);
    const plan = { actor: userAmy, projectId: set.project.id, stage: 'plan' } as const;
    const refused = await set.startRun.execute({ ...plan, cloudConsent: true });

    await set.continueRun.execute({ actor: userAmy, runId: paused.id, extra });
    set.harness.executor.settle(paused.id, { endState: 'Completed' });
    await stateOf(set.harness, paused, 'Ended');
    const started = await set.startRun.execute({ ...plan, cloudConsent: true });

    expect(refused).toEqual({ ok: false, error: 'RST-2311' });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(await approvedOf(set.harness, started.value.run)).toEqual(extra);
  });
});

describe('RF-432 Continue on a step of a journey, at the limits', () => {
  it('RF-432 P9-01 the journey never passes the administrator ceilings, nor does the run', async () => {
    const set = await setup();
    const paused = await pausedStep(set);
    const record = await set.journeys.find(userAmy.userId, set.project.id);
    if (record === undefined) throw new Error('No journey.');
    const room = 1_000;
    await set.journeys.save({
      ...record,
      approved: { tokens: MAX_RUN_TOKENS - room, costMicros: 0 },
    });

    const continued = await set.continueRun.execute({ actor: userAmy, runId: paused.id, extra });

    expect(continued.ok).toBe(true);
    const raised = await set.journeys.find(userAmy.userId, set.project.id);
    expect(raised?.approved).toEqual({ tokens: MAX_RUN_TOKENS, costMicros: 0 });
    expect(await approvedOf(set.harness, paused)).toMatchObject({ tokens: worst.tokens + room });
  });

  it('RF-432 P9-01 a Continue that cannot queue the run raises neither amount', async () => {
    const set = await setup();
    const paused = await pausedStep(set);
    const line = await approvedOf(set.harness, paused);
    vi.spyOn(set.harness.runs, 'continueAwaiting').mockResolvedValueOnce(undefined);

    const continued = await set.continueRun.execute({ actor: userAmy, runId: paused.id, extra });

    expect(continued).toEqual({ ok: false, error: ERROR_CODES.conflict });
    const record = await set.journeys.find(userAmy.userId, set.project.id);
    expect(record?.approved).toEqual({ tokens: worst.tokens, costMicros: 0 });
    expect(await approvedOf(set.harness, paused)).toEqual(line);
  });
});

describe('RF-432 Continue on a run that is not a step of a journey', () => {
  it('RF-432 P9-01 a run of a project with no journey raises only its own amount', async () => {
    const set = await setup();
    const paused = await pausedStep(set);
    const { harness } = set;
    const { runs, manifests, queue, clock } = harness;
    const noJourney = new ContinueRun({ runs, manifests, queue, clock });
    const line = await approvedOf(harness, paused);

    const continued = await noJourney.execute({ actor: userAmy, runId: paused.id, extra });

    expect(continued.ok).toBe(true);
    expect(await approvedOf(harness, paused)).toMatchObject({
      tokens: (line?.tokens ?? 0) + extra.tokens,
    });
    const record = await set.journeys.find(userAmy.userId, set.project.id);
    expect(record?.approved).toEqual({ tokens: worst.tokens, costMicros: 0 });
  });

  it('RF-432 P9-01 a journey recorded after the run was queued is not raised', async () => {
    const set = await setup();
    const paused = await pausedStep(set);
    const record = await set.journeys.find(userAmy.userId, set.project.id);
    if (record === undefined) throw new Error('No journey.');
    const later = { ...record, createdAt: paused.queuedAt + 1 };
    await set.journeys.save(later);

    const continued = await set.continueRun.execute({ actor: userAmy, runId: paused.id, extra });

    expect(continued.ok).toBe(true);
    expect(await set.journeys.find(userAmy.userId, set.project.id)).toEqual(later);
  });
});
