import { expect, it } from 'vitest';
import {
  RunBudgetEvents,
  type SpendTotals,
} from '../../../../src/application/runs/run-budget-events.js';
import {
  budgetEventEmitter as emitter,
  type Emitted,
} from '../../../support/budget-event-fixtures.js';

// RF-422, RF-1106, DEC-107: `budget.capReached` names the cap that refused the call and where that
// cap comes from (the project, the administrator or the account), so the message can say who can
// raise it. Recorded events only.

const zero: SpendTotals = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costMicros: 0n };

function capEvent(emitted: readonly Emitted[]): unknown {
  return emitted.find((each) => each.type === 'budget.capReached')?.data;
}

it('RF-422 a run cap of the administrator is reported with capSource administrator', async () => {
  const events = emitter();
  const reporter = new RunBudgetEvents({ events, run: zero, project: zero });

  await reporter.capReached({
    kind: 'run-cost',
    limit: 500_000n,
    spent: 340_000n,
    needed: 200_000n,
    source: 'administrator',
  });

  expect(capEvent(events.emitted)).toEqual({
    scope: 'run-cost',
    capMicros: 500_000,
    spentMicros: 340_000,
    capSource: 'administrator',
  });
});

it('RF-1106 the daily cap of the account is reported with capSource account', async () => {
  const events = emitter();
  const reporter = new RunBudgetEvents({ events, run: zero, project: zero });

  await reporter.capReached({
    kind: 'user-day',
    limit: 750_000n,
    spent: 700_000n,
    needed: 100_000n,
    source: 'account',
  });

  expect(capEvent(events.emitted)).toMatchObject({ scope: 'user-day', capSource: 'account' });
});

it('RF-422 a cap without a source (a role cap) is reported as before, with no capSource', async () => {
  const events = emitter();
  const reporter = new RunBudgetEvents({ events, run: zero, project: zero });

  await reporter.capReached({
    kind: 'role-cost',
    limit: 9n,
    spent: 9n,
    needed: 1n,
    role: 'reader',
  });

  expect(capEvent(events.emitted)).toEqual({
    scope: 'role-cost',
    role: 'reader',
    capMicros: 9,
    spentMicros: 9,
  });
});
