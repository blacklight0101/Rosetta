import { expect, it } from 'vitest';
import {
  RunBudgetEvents,
  type SpendTotals,
} from '../../../../src/application/runs/run-budget-events.js';
import { capsFor } from '../../../../src/domain/budget/budget.js';
import {
  budgetEventEmitter as emitter,
  ledgerEntryFixture as entry,
} from '../../../support/budget-event-fixtures.js';

// RF-1003, RF-429, DEC-193: the run's budget warnings measure the run's share of its own caps. The
// verifier's reserve line (the run token cap less the summariser's part) is not a run cap, so a
// verifier call does not make the run look closer to its cap than it is.

const zero: SpendTotals = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costMicros: 0n };

it('RF-1003 DEC-193 a verifier call at 86% of the run token cap warns at 50 and 80 only, not at 95', async () => {
  const events = emitter();
  const reporter = new RunBudgetEvents({ events, run: zero, project: zero });
  const caps = capsFor('none', {
    run: { maxCostMicros: 1_000_000n, maxTokens: 1_000n },
    verifier: true,
    server: { runMicros: 0n, userDayMicros: 0n, serverMonthMicros: 0n },
    account: { dailyCapMicros: null, ownDailyCapMicros: null },
  });

  await reporter.callRecorded({
    entry: entry({
      role: 'verifier',
      inputTokens: 760,
      outputTokens: 100,
      cachedInputTokens: 0,
      costMicros: 0n,
    }),
    caps,
  });

  const warnings = events.emitted.filter((each) => each.type === 'budget.warning');
  expect(warnings.map((each) => each.data)).toEqual([
    { scope: 'run', sharePercent: 50 },
    { scope: 'run', sharePercent: 80 },
  ]);
});
