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
  it('RF-613 RF-624 shows five planner calls, high covering the sum of their worst cases', async () => {
    const h = await priced('four');

    const estimate = await h.estimate();
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('Completed');
    const reservations = h.providers.ledger.reservations.map((each) => each.reservation);
    const { high } = estimate.planner.points;
    expect(reservations).toHaveLength(5);
    const sum = (pick: (worst: (typeof reservations)[number]['worstCase']) => bigint): bigint =>
      reservations.reduce((total, each) => total + pick(each.worstCase), 0n);
    // The flows call's components block is sized at the plan answer's limits (flows-estimate.ts), so the
    // high figure is an upper bound of the guard's worst cases, never below them.
    expect(high.costMicros).toBeGreaterThanOrEqual(sum((worst) => worst.micros));
    expect(BigInt(high.inputTokens + high.outputTokens)).toBeGreaterThanOrEqual(
      sum((worst) => worst.tokens),
    );
    expect(estimate.assumptions.calls).toBe(5);
  });
});

describe('a cap that fits the first four planner calls but not the fifth', () => {
  it('RF-422 RF-624 the guard stops the run before the API contract call, with no package', async () => {
    const base = await priced('base');
    await base.plan({ cloudConsent: true });
    const worst = base.providers.ledger.reservations.map(
      (each) => each.reservation.worstCase.micros,
    );
    const spent = base.providers.ledger.entries.map((each) => each.costMicros);
    const [fourth, fifth] = [worst[3], worst[4]];
    if (fourth === undefined || fifth === undefined)
      throw new Error('The baseline run made five calls');
    const before = spent.slice(0, 4).reduce((total, each) => total + each, 0n);
    const cap = before + fifth - 1n;
    const beforeFourth = before - (spent[3] ?? 0n);
    expect(cap).toBeGreaterThanOrEqual(beforeFourth + fourth);

    const h = await priced('capped', cappedRun(Number(cap)));
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('CapReached');
    expect(h.providers.requests()).toHaveLength(4);
    expect(await h.handoffOf(run)).toEqual({});
  });
});
