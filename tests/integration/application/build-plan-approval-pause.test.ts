import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import type { Run } from '../../../src/domain/runs/run.js';
import {
  loadRecording,
  type Recording,
} from '../../../src/infrastructure/providers/fake/recording.js';
import { MemoryJourneyRecords } from '../../../src/infrastructure/db/memory-journey-records.js';
import { planEstimateOf } from '../../support/plan-estimate-of.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-432, RF-435, EV-82, P8-01: a plan run of a journey runs under what is left of the amount its
// owner approved, like understand and Deepen. Its line is that amount, not the project run cap: it
// pauses there (`AwaitingApproval`) and Continue (+N) goes on with the answers it already paid for,
// so the calls are made once. A plan run with no approved amount (the evaluation tools) keeps the
// project run cap as a hard stop. The planner is an OpenAI model on the server's key behind the
// real provider factory and budget guard, replaying the planner recordings.

const temp = useTempRoot('rosetta-plan-approval-');

async function seededHarness(
  folder: string,
  change: (settings: ProjectSettings) => ProjectSettings = (settings) => settings,
  asked: (calls: Recording['calls']) => Recording['calls'] = (calls) => calls,
): Promise<PlanHarness> {
  const recorded = await loadRecording(join('tests', 'recordings', 'fake', 'planner-package.json'));
  const recording = { ...recorded, calls: asked(recorded.calls) };
  const h = await createPlanHarness(join(temp.path, folder), recording, {
    cloudPlanner: true,
    settings: change,
  });
  const run = await h.understandRun({ cards: planCards(), questions: planQuestions });
  await h.answer(run, [{ cardId: 'OQ-001', answer: 'Only a manager may cancel a paid order.' }]);
  await h.saveBrief({ migration: 'parallel-change' });
  return h;
}

function cappedRun(maxCostMicros: number) {
  return (settings: ProjectSettings): ProjectSettings => ({
    ...settings,
    budget: { ...settings.budget, run: { ...settings.budget.run, maxCostMicros } },
  });
}

/** The baseline: what each call of an uncapped plan run reserves and spends. */
async function baseline() {
  const h = await seededHarness('base');
  const run = await h.plan({ cloudConsent: true });
  expect(run.endState).toBe('Completed');
  const worst = h.providers.ledger.reservations.map((each) => each.reservation.worstCase.micros);
  const spent = h.providers.ledger.entries.map((each) => each.costMicros);
  const [first, second, third] = worst;
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error('The baseline run made at least three calls');
  }
  // The line passes the third call's worst case after the first two calls are paid.
  const line = (spent[0] ?? 0n) + (spent[1] ?? 0n) + third - 1n;
  const total = spent.reduce((sum, each) => sum + each, 0n);
  return { calls: h.providers.requests().length, line: Number(line), total };
}

/** Continue (+N) until the run ends, as an owner who answers every question does. */
async function continued(h: PlanHarness, paused: Run): Promise<Run> {
  let latest = paused;
  for (let answers = 0; answers < 8 && latest.queueState === 'AwaitingApproval'; answers += 1) {
    const answer = await h.continueRun(latest);
    if (!answer.ok) throw new Error(`Continue was refused: ${answer.error}`);
    latest = answer.value;
  }
  return latest;
}

describe('RF-432 a plan run that reaches its approved amount', () => {
  it('RF-432 RF-435 pauses before the call that passes it, then Continue ends Completed with no call made twice', async () => {
    const base = await baseline();
    const h = await seededHarness('paused');
    const approvedAmount = { tokens: 40_000_000, costMicros: base.line };

    const paused = await h.plan({ cloudConsent: true, approvedAmount });

    expect(paused).toMatchObject({ queueState: 'AwaitingApproval', endState: null });
    expect(h.providers.requests()).toHaveLength(2);
    const kept = JSON.parse(
      await readFile(join(h.runFolder(paused), 'planner-answers.json'), 'utf8'),
    ) as { readonly answers: Readonly<Record<string, string>> };
    expect(Object.keys(kept.answers)).toEqual(['planner-package#1', 'planner-prd#1']);
    const done = await continued(h, paused);
    expect(done).toMatchObject({ id: paused.id, endState: 'Completed' });
    // The answers paid for before the pause are read back, so every call is made once.
    expect(h.providers.requests()).toHaveLength(base.calls);
    const spent = h.providers.ledger.entries.reduce((sum, each) => sum + each.costMicros, 0n);
    expect(spent).toBe(base.total);
    expect(Object.keys(await h.handoffOf(done))).toContain('README.md');
    // RF-408: the continued run numbers its calls on, so no two calls of the run share an id.
    const ids = h.providers.ledger.reservations.map((each) => each.reservation.callId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('RF-432 a plan run whose inputs change during the pause', () => {
  it('RF-432 P8-01 a brief edited during the pause drops the kept answers, so Continue uses none of them', async () => {
    const base = await baseline();
    // The fake planner replays its calls in order: the plan and the PRD are recorded twice, for the
    // attempt before the pause and for the one after the edit.
    const h = await seededHarness('edited', undefined, (calls) => [...calls.slice(0, 2), ...calls]);
    const approvedAmount = { tokens: 40_000_000, costMicros: base.line };
    const paused = await h.plan({ cloudConsent: true, approvedAmount });
    expect(paused.queueState).toBe('AwaitingApproval');

    await h.saveBrief({ migration: 'strangler-fig' });
    const done = await continued(h, paused);

    expect(done).toMatchObject({ id: paused.id, endState: 'Completed' });
    // The plan and the PRD are asked again from the edited brief; nothing paid before is reused.
    const tasks = h.providers.requests().map((each) => each.context.agentTaskId);
    expect(tasks.filter((task) => task === 'planner-package')).toHaveLength(2);
    expect(tasks.filter((task) => task === 'planner-prd')).toHaveLength(2);
    expect(h.s.logger.entries).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('changed while the run was paused') as unknown,
      }),
    );
    const manifest = await h.manifestOf(done);
    expect(JSON.stringify(manifest)).toContain('strangler-fig');
  });
});

describe('RF-435 the line of a plan run', () => {
  it('RF-435 EV-82 a project run cap the plan passes does not end the run while the journey amount allows it', async () => {
    const base = await baseline();
    const h = await seededHarness('journey', cappedRun(base.line));

    const run = await h.plan({
      cloudConsent: true,
      approvedAmount: { tokens: 40_000_000, costMicros: 50_000_000 },
    });

    expect(run.endState).toBe('Completed');
    expect(h.providers.requests()).toHaveLength(base.calls);
  });

  it('RF-432 a plan run with no approved amount keeps the project run cap as a hard stop', async () => {
    const base = await baseline();
    const h = await seededHarness('no-journey', cappedRun(base.line));

    const run = await h.plan({ cloudConsent: true });

    expect(run).toMatchObject({ queueState: 'Ended', endState: 'CapReached' });
    expect(h.providers.requests()).toHaveLength(2);
  });
});

describe('RF-613 the plan estimate names the line the run gets', () => {
  it('RF-435 P8-01 a project with a journey: the run caps are what is left of the approved amount', async () => {
    const h = await seededHarness('estimate-journey');
    const journeys = new MemoryJourneyRecords();
    await journeys.save({
      ...{ userId: h.project.userId, projectId: h.project.id, createdAt: Number.MAX_SAFE_INTEGER },
      approved: { tokens: 3_000_000, costMicros: 400_000 },
    });

    const estimate = await planEstimateOf(h.s, h.project, undefined, journeys);

    expect(estimate).toMatchObject({ runLine: 'journey' });
    const runCost = estimate.caps.find((cap) => cap.kind === 'run-cost');
    expect(runCost).toMatchObject({ approved: true, limit: 400_000n });
    expect(estimate.caps.find((cap) => cap.kind === 'run-tokens')?.limit).toBe(3_000_000n);
  });

  it('RF-435 P9-02 the estimate gives the approved total and whether the journey is used up', async () => {
    const h = await seededHarness('estimate-journey-total');
    const journeys = new MemoryJourneyRecords();
    await journeys.save({
      ...{ userId: h.project.userId, projectId: h.project.id, createdAt: Number.MAX_SAFE_INTEGER },
      approved: { tokens: 3_000_000, costMicros: 400_000 },
    });

    const estimate = await planEstimateOf(h.s, h.project, undefined, journeys);

    expect(estimate.journey).toEqual({
      approved: { tokens: 3_000_000, costMicros: 400_000 },
      usedUp: false,
    });
  });

  it('RF-432 P8-01 a project with no journey: the project run caps, whose high figure does not fit', async () => {
    const h = await seededHarness('estimate-project');

    const estimate = await h.estimate();

    expect(estimate).toMatchObject({ runLine: 'project' });
    expect(estimate.journey).toBeUndefined();
    expect(estimate.caps.find((cap) => cap.kind === 'run-cost')).toMatchObject({
      approved: false,
      limit: 500_000n,
      fits: { high: false },
    });
  });
});
