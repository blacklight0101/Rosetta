import { describe, expect, it } from 'vitest';
import { RunBudgetEvents } from '../../../../src/application/runs/run-budget-events.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  budgetEventEmitter,
  ledgerEntryFixture,
  ledgerGroupFixture,
} from '../../../support/budget-event-fixtures.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';

// RF-422, RF-1010, P1-96 (fix round 1): a run's cap stop is one `budget.capReached` however many
// parallel calls the cap refuses, and the reporter of a run whose totals cannot be read starts
// from zero instead of failing the run.

const zero = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costMicros: 0n };
const runKey = '20261012-100000-understand';
const run = { userId: 'user-1', id: 'run-1', projectId: 'project-1', runKey };

describe('RunBudgetEvents cap stop', () => {
  it('RF-422 two refusals at the same time publish budget.capReached once', async () => {
    const events = budgetEventEmitter();
    const reporter = new RunBudgetEvents({ events, run: zero, project: zero });
    const breach = { kind: 'run-cost', limit: 10_000n, spent: 9_800n, needed: 900n } as const;

    await Promise.all([reporter.capReached(breach), reporter.capReached(breach)]);
    await reporter.capReached({ ...breach, kind: 'user-day' });

    expect(events.emitted.map((each) => each.type)).toEqual(['budget.capReached']);
    expect(events.emitted[0]?.data).toEqual({
      scope: 'run-cost',
      capMicros: 10_000,
      spentMicros: 9_800,
    });
  });
});

describe('RunBudgetEvents.open when the totals cannot be read', () => {
  it('RF-1010 logs the failure and starts from zero, so the run goes on', async () => {
    const events = budgetEventEmitter();
    const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());
    const group = { costMicros: 3_000n, inputTokens: 10, outputTokens: 2, cachedInputTokens: 0 };

    const reporter = await RunBudgetEvents.open({
      events,
      run,
      ledger: { runEntries: () => Promise.reject(new Error('the database is gone')) },
      costTotals: { projectGroups: () => Promise.resolve([ledgerGroupFixture(group)]) },
      logger,
    });
    await reporter.callRecorded({
      entry: ledgerEntryFixture({ costMicros: 500n }),
      caps: [{ kind: 'run-cost', limit: 1_000_000n }],
    });

    expect(events.emitted[0]?.data).toMatchObject({
      runTotals: { costMicros: 500 },
      projectTotals: { costMicros: 500 },
    });
    expect(logger.entries).toMatchObject([
      { level: 'warn', logger: 'budget', code: ERROR_CODES.costRecordFailed, runId: runKey },
    ]);
  });
});
