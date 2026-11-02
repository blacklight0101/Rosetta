import { describe, expect, it } from 'vitest';
import {
  continueAmountOf,
  raiseApprovedAmount,
} from '../../../../src/domain/budget/approved-amount.js';
import { capsFor, type CapInputs } from '../../../../src/domain/budget/budget.js';
import { continueRun, endRun, pauseRun } from '../../../../src/domain/runs/run.js';
import { runningRun, sampleRun } from '../../../support/run-fixtures.js';

// RF-432, ADR-026, DEC-196: a running run that nears its approved amount pauses in the queue state
// `AwaitingApproval`; Continue queues it again with the amount raised by N; Stop ends it `CapReached`.
// The approved amount replaces the project's run caps as the run's line; the administrator's run
// cap and the day and month caps stay hard (DEC-112).

describe('a run waiting for approval', () => {
  it('RF-432 pauses a running run and keeps the areas no reader started', () => {
    const running = runningRun();

    expect(pauseRun(running, { unreadAreas: 2 })).toEqual({
      ok: true,
      value: { ...running, queueState: 'AwaitingApproval', unreadAreas: 2 },
    });
    expect(pauseRun(sampleRun(), {})).toEqual({ ok: false, error: 'not-running' });
  });

  it('RF-432 Continue queues the paused run again at the end of the queue', () => {
    const paused = { ...runningRun(), queueState: 'AwaitingApproval' as const, unreadAreas: 2 };

    expect(continueRun(paused, 9_000)).toEqual({
      ok: true,
      value: { ...paused, queueState: 'Queued', unreadAreas: 0, queuedAt: 9_000, startedAt: null },
    });
    expect(continueRun(runningRun(), 9_000)).toEqual({
      ok: false,
      error: 'not-awaiting-approval',
    });
  });

  it('RF-432 Stop ends a paused run CapReached; it cannot end Completed or Failed', () => {
    const paused = { ...runningRun(), queueState: 'AwaitingApproval' as const };

    expect(endRun(paused, 'CapReached', 9_000, { unreadAreas: 1 })).toMatchObject({
      ok: true,
      value: { queueState: 'Ended', endState: 'CapReached', unreadAreas: 1 },
    });
    expect(endRun(paused, 'Completed', 9_000)).toEqual({
      ok: false,
      error: 'awaiting-run-can-only-be-stopped',
    });
  });
});

describe('the approved amount', () => {
  it('RF-432 Continue offers the recorded remainder, else half the approved amount', () => {
    const remainder = { tokens: 500, costMicros: 70 };

    expect(continueAmountOf({ tokens: 1_000, costMicros: 99, remainder })).toEqual(remainder);
    expect(continueAmountOf({ tokens: 1_001, costMicros: 99 })).toEqual({
      tokens: 501,
      costMicros: 50,
    });
  });

  it('RF-432 Continue raises the amount by N and keeps the remainder', () => {
    const remainder = { tokens: 5, costMicros: 5 };

    expect(
      raiseApprovedAmount({ tokens: 10, costMicros: 20, remainder }, { tokens: 1, costMicros: 2 }),
    ).toEqual({ tokens: 11, costMicros: 22, remainder });
  });
});

describe('the caps of a run with an approved amount', () => {
  const inputs: CapInputs = {
    run: { maxCostMicros: 2_000_000n, maxTokens: 2_000_000n },
    server: { runMicros: 900_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n },
    account: { dailyCapMicros: null, ownDailyCapMicros: null },
  };
  const approved = { maxCostMicros: 3_000_000n, maxTokens: 5_000_000n };

  it('RF-432 replaces the project run caps with the approved amount, marked approved', () => {
    expect(capsFor('user', { ...inputs, approved })).toEqual([
      { kind: 'run-cost', limit: 3_000_000n, source: 'approved' },
      { kind: 'run-tokens', limit: 5_000_000n, source: 'approved' },
    ]);
  });

  it('DEC-112 keeps the administrator run cap and the day and month caps hard on server keys', () => {
    const caps = capsFor('server', { ...inputs, approved });

    expect(caps).toEqual([
      { kind: 'run-cost', limit: 900_000n, source: 'administrator' },
      { kind: 'run-tokens', limit: 5_000_000n, source: 'approved' },
      { kind: 'user-day', limit: 1_000_000n, source: 'administrator' },
      { kind: 'server-month', limit: 10_000_000n, source: 'administrator' },
    ]);
  });

  it('RF-422 a run without an approved amount keeps its project caps unmarked', () => {
    expect(capsFor('user', inputs)).toEqual([
      { kind: 'run-cost', limit: 2_000_000n, source: 'project' },
      { kind: 'run-tokens', limit: 2_000_000n },
    ]);
  });
});
