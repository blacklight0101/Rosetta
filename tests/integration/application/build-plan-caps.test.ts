import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-613, RF-422, RF-423, ADR-007, DEC-81: the plan estimate and the plan run agree. The planner is
// an OpenAI model on the server's key (1 USD per million input tokens, 2 USD per million output
// tokens) behind the real provider factory and budget guard, replaying the planner recording. The
// estimate's high figure is the guard's worst case; a cap it does not fit refuses the call.

const temp = useTempRoot('rosetta-plan-caps-');

async function seededHarness(
  change?: (settings: ProjectSettings) => ProjectSettings,
  folder = 'run',
) {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  const h = await createPlanHarness(join(temp.path, folder), recording, {
    cloudPlanner: true,
    ...(change === undefined ? {} : { settings: change }),
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

function cappedPlanner(maxCostMicros: number) {
  return (settings: ProjectSettings): ProjectSettings => ({
    ...settings,
    budget: { ...settings.budget, roles: { planner: { maxCostMicros } } },
  });
}

async function assertNothingSent(h: PlanHarness, endState: string): Promise<void> {
  const run = await h.plan({ cloudConsent: true });
  expect(run.endState).toBe(endState);
  expect(h.providers.requests()).toEqual([]);
  expect(await h.handoffOf(run)).toEqual({});
}

describe('plan estimate against the budget guard', () => {
  it('RF-613 the estimate shows the three planner calls the guard then meters, high being the sum of their worst cases', async () => {
    const h = await seededHarness();

    const estimate = await h.estimate();
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('Completed');
    expect(estimate.withinCaps).toEqual({ low: true, likely: true, high: true });
    const reservations = h.providers.ledger.reservations.map((each) => each.reservation);
    const { high } = estimate.planner.points;
    expect(reservations.map((each) => each.role)).toEqual(['planner', 'planner', 'planner']);
    const sum = (pick: (worst: (typeof reservations)[number]['worstCase']) => bigint): bigint =>
      reservations.reduce((total, each) => total + pick(each.worstCase), 0n);
    expect(sum((worst) => worst.micros)).toBe(high.costMicros);
    expect(sum((worst) => worst.tokens)).toBe(BigInt(high.inputTokens + high.outputTokens));
    const spent = h.providers.ledger.entries.reduce((total, each) => total + each.costMicros, 0n);
    expect(spent).toBeLessThanOrEqual(high.costMicros);
    expect(h.providers.ledger.entries).toHaveLength(3);
  });

  it('RF-613 a run cap the high figure does not fit is shown, and the guard refuses the call', async () => {
    const h = await seededHarness(cappedRun(1000));

    const estimate = await h.estimate();

    expect(estimate.caps.find((cap) => cap.kind === 'run-cost')?.fits.high).toBe(false);
    expect(estimate.withinCaps.high).toBe(false);
    await assertNothingSent(h, 'CapReached');
    const run = await h.s.runs.list(h.project.userId, h.project.id);
    expect(run.find((each) => each.stage === 'plan')?.endState).toBe('CapReached');
  });

  it('RF-423 the planner role cap the high figure does not fit refuses the call too', async () => {
    const h = await seededHarness(cappedPlanner(1000));

    const estimate = await h.estimate();

    expect(estimate.caps.find((cap) => cap.kind === 'role-cost')?.fits.high).toBe(false);
    await assertNothingSent(h, 'CapReached');
    expect(h.s.logger.entries).toContainEqual(
      expect.objectContaining({ code: ERROR_CODES.budgetCapReached }),
    );
  });
});

describe('plan run: a cap that fits the plan call but not the PRD call', () => {
  it('RF-423 RF-621 the planner role cap passed by the second call ends the run CapReached with no PRD sent', async () => {
    const first = await seededHarness(undefined, 'first');
    await first.plan({ cloudConsent: true });
    const firstWorst = first.providers.ledger.reservations[0]?.reservation.worstCase.micros ?? 0n;
    expect(firstWorst).toBeGreaterThan(0n);

    const h = await seededHarness(cappedPlanner(Number(firstWorst)), 'second');
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('CapReached');
    expect(h.providers.requests()).toHaveLength(1);
    expect(h.providers.requests()[0]?.context.agentTaskId).toBe('planner-package');
    expect(await h.handoffOf(run)).toEqual({});
    expect(h.s.logger.entries).toContainEqual(
      expect.objectContaining({ code: ERROR_CODES.budgetCapReached }),
    );
  });
});

describe('a cap that fits the first two planner calls but not the third', () => {
  it('RF-422 RF-623 the guard stops the run before the data model call, with no package', async () => {
    const base = await seededHarness(undefined, 'base');
    await base.plan({ cloudConsent: true });
    const worst = base.providers.ledger.reservations.map(
      (each) => each.reservation.worstCase.micros,
    );
    const spent = base.providers.ledger.entries.map((each) => each.costMicros);
    const [first, second, third] = worst;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('The baseline run made three calls');
    }
    const cap = (spent[0] ?? 0n) + (spent[1] ?? 0n) + third - 1n;
    expect(cap).toBeGreaterThanOrEqual((spent[0] ?? 0n) + second);

    const h = await seededHarness(cappedRun(Number(cap)), 'capped');
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('CapReached');
    expect(h.providers.requests()).toHaveLength(2);
    expect(await h.handoffOf(run)).toEqual({});
  });
});
