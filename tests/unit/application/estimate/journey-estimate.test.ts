import { describe, expect, it } from 'vitest';
import type {
  ByScenario,
  EstimatePoint,
} from '../../../../src/application/estimate/estimate-types.js';
import {
  journeyEstimateOf,
  measuredRunsOf,
} from '../../../../src/application/estimate/journey-estimate.js';
import type { LedgerGroup } from '../../../../src/application/ports/cost-totals.js';
import { DEEPEN_ROUNDS } from '../../../../src/domain/deepen/stop-rule.js';

// RF-430, DEC-196, EV-62: the likely and the worst-case total of the whole journey (understand with
// claim checking, the default Deepen rounds and the plan), from the fixed assumptions when there is
// no history and from the measured totals of earlier runs, scaled by the source size, when there is.

const point = (tokens: number, costMicros = 0n): EstimatePoint => ({
  inputTokens: Math.round(tokens * 0.8),
  outputTokens: tokens - Math.round(tokens * 0.8),
  costMicros,
});

const understandOf = (low: number, likely: number, high: number): ByScenario<EstimatePoint> => ({
  low: point(low, 1_000n),
  likely: point(likely, 2_000n),
  high: point(high, 4_000n),
});

const noHistory = { sourceTokens: 1_000_000, deepenRounds: DEEPEN_ROUNDS.default, history: [] };

describe('RF-430 the journey estimate from the fixed assumptions', () => {
  it('RF-430 gives a likely and a worst-case total that include the Deepen rounds and claim checking', () => {
    const understand = understandOf(1_000_000, 2_000_000, 4_000_000);

    const journey = journeyEstimateOf({ ...noHistory, understand });

    expect(journey.basis).toBe('assumptions');
    expect(journey.deepenRounds).toBe(DEEPEN_ROUNDS.default);
    // The understand run's figures already hold the verifier (claim checking): the journey adds the
    // Deepen rounds and the plan on top of them.
    expect(journey.likely.tokens).toBeGreaterThan(2_000_000);
    expect(journey.worstCase.tokens).toBeGreaterThan(4_000_000 * (1 + DEEPEN_ROUNDS.default));
    expect(journey.worstCase.tokens).toBeGreaterThan(journey.likely.tokens);
    expect(journey.worstCase.costMicros).toBeGreaterThan(journey.likely.costMicros);
  });

  it('RF-430 more Deepen rounds give a larger journey', () => {
    const understand = understandOf(1_000_000, 2_000_000, 4_000_000);

    const one = journeyEstimateOf({ ...noHistory, understand, deepenRounds: 1 });
    const three = journeyEstimateOf({ ...noHistory, understand, deepenRounds: 3 });

    expect(three.likely.tokens).toBeGreaterThan(one.likely.tokens);
    expect(three.worstCase.tokens).toBeGreaterThan(one.worstCase.tokens);
  });

  it('EV-62 the eShop-shaped worst case is above the measured total of the evaluation runs', () => {
    // EV-62: the eShop understand estimate was 8M tokens at its high point; the understand run
    // used about that and the Deepen after it needed 16M more.
    const measured = 8_000_000 + 16_000_000;
    const understand = understandOf(2_000_000, 4_000_000, 8_000_000);

    const journey = journeyEstimateOf({ ...noHistory, understand });

    expect(journey.worstCase.tokens).toBeGreaterThan(measured);
  });
});

describe('RF-430 the journey estimate from the history', () => {
  it('RF-430 scales the measured totals of earlier runs by the source size', () => {
    const understand = understandOf(1_000, 2_000, 4_000);
    const history = [
      { runId: 'r1', sourceTokens: 500_000, tokens: 6_000_000, costMicros: 3_000_000n },
      { runId: 'r2', sourceTokens: 500_000, tokens: 4_000_000, costMicros: 1_000_000n },
    ];

    const journey = journeyEstimateOf({ ...noHistory, understand, history });

    expect(journey.basis).toBe('history');
    // The source is twice the size it was: 10M tokens measured become 20M.
    expect(journey.likely).toEqual({ tokens: 20_000_000, costMicros: 8_000_000n });
    expect(journey.worstCase.tokens).toBeGreaterThan(journey.likely.tokens);
    expect(journey.worstCase.costMicros).toBeGreaterThan(journey.likely.costMicros);
  });

  it('RF-430 the worst case is never below the understand run alone', () => {
    const understand = understandOf(1_000_000, 2_000_000, 40_000_000);
    const history = [{ runId: 'r1', sourceTokens: 1_000_000, tokens: 1_000, costMicros: 0n }];

    const journey = journeyEstimateOf({ ...noHistory, understand, history });

    expect(journey.worstCase.tokens).toBeGreaterThanOrEqual(40_000_000);
  });
});

function group(overrides: Partial<LedgerGroup>): LedgerGroup {
  return {
    currency: 'USD',
    costKnown: true,
    priceTableVersion: '2026-10-11',
    local: false,
    calls: 1,
    inputTokens: 1_000,
    outputTokens: 200,
    cachedInputTokens: 0,
    costMicros: 10n,
    runId: 'r1',
    stage: 'understand',
    role: 'reader',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    keySource: 'server',
    firstAt: new Date('2026-10-29T10:00:00.000Z'),
    ...overrides,
  };
}

describe('RF-428 RF-430 the measured runs of the ledger', () => {
  it('RF-430 sums the rows of each run of the same provider and model, of understand and plan runs only', () => {
    const groups = [
      group({}),
      group({ role: 'verifier', inputTokens: 500, outputTokens: 100, costMicros: 5n }),
      group({ runId: 'r2', stage: 'plan', role: 'planner' }),
      group({ runId: 'r3', model: 'another-model' }),
      group({ runId: null, stage: 'provider-test' }),
      group({ runId: 'r4', stage: 'scan' }),
    ];

    const runs = measuredRunsOf(
      groups,
      { provider: 'anthropic', model: 'claude-haiku-4-5' },
      70_000,
    );

    expect(runs).toEqual([
      { runId: 'r1', sourceTokens: 70_000, tokens: 1_800, costMicros: 15n },
      { runId: 'r2', sourceTokens: 70_000, tokens: 1_200, costMicros: 10n },
    ]);
  });
});
