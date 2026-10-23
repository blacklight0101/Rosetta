import { describe, expect, it } from 'vitest';
import { roleTotalsOf, shareOf } from '../../../web/src/lib/live-run/run-summary.js';
import { ev, planned, runEnded, startedData, stateAfter, turn } from './live-run-fixtures.js';

// RF-1003, RF-424, RF-1108: the run meter and the end of a run, taken from the events.

describe('the tokens and cost per role', () => {
  it('RF-1003 adds tokens per role and in total from the turns of every agent', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      planned(2, 'reader-002', 'Services'),
      turn(3, 'reader-001', 1, [900, 40]),
      turn(4, 'reader-002', 1, [100, 10]),
      ev(5, 'agent.planned', { area: 'x', role: 'verifier', model: 'gpt' }, 'verifier-001'),
      turn(6, 'verifier-001', 1, [50, 5]),
    );

    expect(roleTotalsOf(state)).toEqual([
      {
        role: 'reader',
        inputTokens: 1_000,
        outputTokens: 50,
        cachedInputTokens: 0,
        costMicros: undefined,
      },
      {
        role: 'verifier',
        inputTokens: 50,
        outputTokens: 5,
        cachedInputTokens: 0,
        costMicros: undefined,
      },
    ]);
  });

  it('RF-424 adds cost per role and agent when usage events arrive', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      ev(2, 'usage.recorded', { callId: 'c#1', role: 'reader', costMicros: 1_500 }, 'reader-001'),
      ev(3, 'usage.recorded', { callId: 'c#2', role: 'reader', costMicros: 500 }, 'reader-001'),
    );

    expect(state.agents[0]?.costMicros).toBe(2_000);
    expect(roleTotalsOf(state)).toEqual([
      { role: 'reader', inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costMicros: 2_000 },
    ]);
  });
});

describe('the cap and the end of the run', () => {
  it('RF-1003 reads the cap from the start of the run and the cost from its end', () => {
    const state = stateAfter(ev(1, 'run.started', startedData), runEnded(2, 'Completed'));

    expect(state.caps).toEqual({ maxCostMicros: 2_000_000, maxTokens: 10_000 });
    expect(state.stage).toBe('understand');
    expect(state.source).toEqual({
      owner: 'octo',
      repo: 'demo',
      subpath: '',
      commitSha: '3f786850e387550fdab836ed7e6dc881de23001b',
    });
    expect(state.ended).toEqual({
      endState: 'Completed',
      errorCode: undefined,
      costMicros: 4_100,
    });
  });

  it('RF-1003 gives the share of a cap in whole percent, never above 100, and 0 without a cap', () => {
    expect(shareOf(412_000, 2_000_000)).toBe(21);
    expect(shareOf(3_000_000, 2_000_000)).toBe(100);
    expect(shareOf(5, 0)).toBe(0);
  });

  it('RF-1108 records the error code of a run that failed', () => {
    const state = stateAfter(ev(1, 'run.started', startedData), runEnded(2, 'Failed', 'RST-2302'));

    expect(state.ended).toMatchObject({ endState: 'Failed', errorCode: 'RST-2302' });
  });
});
