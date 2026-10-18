import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { seededApiPlan } from '../../support/api-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-613, RF-422, RF-624, ADR-007: the plan estimate and the plan run agree when the API contract call
// is made. The planner is an OpenAI model on the server's key behind the real budget guard,
// replaying the planner recording; the estimate's high figure is the guard's worst case.

const temp = useTempRoot('rosetta-plan-api-caps-');

function cappedRun(maxCostMicros: number) {
  return (settings: ProjectSettings): ProjectSettings => ({
    ...settings,
    budget: { ...settings.budget, run: { ...settings.budget.run, maxCostMicros } },
  });
}

function priced(folder: string, change?: (settings: ProjectSettings) => ProjectSettings) {
  const harness = { cloudPlanner: true, ...(change === undefined ? {} : { settings: change }) };
  return seededApiPlan(join(temp.path, folder), { harness });
}

describe('plan estimate with an API contract', () => {
  it('RF-613 RF-624 shows four planner calls, high being the sum of their worst cases', async () => {
    const h = await priced('four');

    const estimate = await h.estimate();
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('Completed');
    const reservations = h.providers.ledger.reservations.map((each) => each.reservation);
    const { high } = estimate.planner.points;
    expect(reservations).toHaveLength(4);
    const sum = (pick: (worst: (typeof reservations)[number]['worstCase']) => bigint): bigint =>
      reservations.reduce((total, each) => total + pick(each.worstCase), 0n);
    expect(sum((worst) => worst.micros)).toBe(high.costMicros);
    expect(sum((worst) => worst.tokens)).toBe(BigInt(high.inputTokens + high.outputTokens));
    expect(estimate.assumptions.calls).toBe(4);
  });
});

describe('a cap that fits the first three planner calls but not the fourth', () => {
  it('RF-422 RF-624 the guard stops the run before the API contract call, with no package', async () => {
    const base = await priced('base');
    await base.plan({ cloudConsent: true });
    const worst = base.providers.ledger.reservations.map(
      (each) => each.reservation.worstCase.micros,
    );
    const spent = base.providers.ledger.entries.map((each) => each.costMicros);
    const [first, second, third, fourth] = worst;
    if (first === undefined || second === undefined || third === undefined || fourth === undefined)
      throw new Error('The baseline run made four calls');
    const before = spent.slice(0, 3).reduce((total, each) => total + each, 0n);
    const cap = before + fourth - 1n;
    expect(cap).toBeGreaterThanOrEqual(before + third);

    const h = await priced('capped', cappedRun(Number(cap)));
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('CapReached');
    expect(h.providers.requests()).toHaveLength(3);
    expect(await h.handoffOf(run)).toEqual({});
  });
});
