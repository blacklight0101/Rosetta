import { describe, expect, it } from 'vitest';
import { stepAmountOf, stepLineOf } from '../../../../src/application/journey/journey-budget.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-435, ADR-027, P8-03: a step runs under what is left of the approved amount after the spend of
// the journey and after what the steps still waiting or running may use of their own lines, so the
// lines of steps that run together never add up to more than the amount.

const owner = { userId: 'u', projectId: 'p' };
const record = { ...owner, approved: { tokens: 4_000, costMicros: 400 }, createdAt: 1_000 };

function step(id: string, spent: number, endState: Run['endState'] = null): Run {
  return sampleRun({
    ...{ id, projectId: 'p', stage: 'understand', queuedAt: 2_000, endState },
    totals: { costMicros: 0, inputTokens: spent, outputTokens: 0, cachedInputTokens: 0 },
  });
}

/** The journey, its runs and the line (approved tokens) each run's manifest records. */
function depsOf(
  runs: readonly Run[],
  lines: Readonly<Record<string, number>>,
  approved = record.approved,
) {
  return {
    journeys: {
      find: () => Promise.resolve({ ...record, approved }),
      save: () => Promise.resolve(),
    },
    runs: { list: () => Promise.resolve(runs) },
    manifests: {
      read: (scope: { readonly runKey: string }) => {
        const run = runs.find((each) => each.runKey === scope.runKey);
        const tokens = run === undefined ? undefined : lines[run.id];
        return Promise.resolve(
          tokens === undefined
            ? undefined
            : ({ options: { approvedAmount: { tokens, costMicros: 0 } } } as never),
        );
      },
    },
  };
}

describe('RF-435 the line of a new step', () => {
  it('RF-435 P8-03 without a step in flight it is the approved amount less the spend', async () => {
    const deps = depsOf([step('a', 1_000, 'Completed')], { a: 4_000 });

    expect(await stepAmountOf(deps, owner)).toEqual({ tokens: 3_000, costMicros: 400 });
  });

  it('RF-435 P8-03 reserves the unused part of the line of every step still queued or running', async () => {
    const deps = depsOf([step('a', 500), step('b', 0)], { a: 1_000, b: 1_000 });

    const line = await stepLineOf(deps, owner);

    // Spent 500; reserved (1,000 - 500) + 1,000 = 1,500; 4,000 - 500 - 1,500 are free.
    expect(line?.amount).toEqual({ tokens: 2_000, costMicros: 400 });
    expect(line?.usedUp).toBe(false);
  });

  it('RF-435 P8-03 two lines never add up to more than the approved amount', async () => {
    const first = await stepAmountOf(depsOf([step('a', 0)], { a: 1_500 }), owner);
    const second = await stepAmountOf(
      depsOf([step('a', 0), step('b', 0)], { a: 1_500, b: first?.tokens ?? 0 }),
      owner,
    );

    expect(first?.tokens).toBe(2_500);
    expect(second?.tokens).toBe(0);
  });

  it('RF-435 P8-03 a remainder of zero tokens is used up, and so is a zero cost where the amount has one', async () => {
    const tokens = depsOf([step('a', 4_000, 'Completed')], { a: 4_000 });
    const priced = {
      ...depsOf([], {}),
      runs: {
        list: () =>
          Promise.resolve([
            sampleRun({
              ...{ projectId: 'p', stage: 'plan', queuedAt: 2_000, endState: 'Completed' },
              totals: { costMicros: 400, inputTokens: 10, outputTokens: 0, cachedInputTokens: 0 },
            }),
          ]),
      },
    };

    expect((await stepLineOf(tokens, owner))?.usedUp).toBe(true);
    expect((await stepLineOf(priced, owner))?.usedUp).toBe(true);
  });
});

describe('RF-435 P8-03 the used-up amount, local', () => {
  it('RF-435 P8-03 a local journey with no dollars is not used up while tokens are left', async () => {
    const local = depsOf(
      [step('a', 100, 'Completed')],
      { a: 4_000 },
      { tokens: 4_000, costMicros: 0 },
    );

    expect((await stepLineOf(local, owner))?.usedUp).toBe(false);
  });
});

describe('RF-435 P8-03 the used-up amount', () => {
  it('RF-435 a project with no journey has no line', async () => {
    const none = {
      ...depsOf([], {}),
      journeys: { find: () => Promise.resolve(undefined), save: () => Promise.resolve() },
    };

    expect(await stepLineOf(none, owner)).toBeUndefined();
  });
});
