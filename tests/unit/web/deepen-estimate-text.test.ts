import { describe, expect, it } from 'vitest';
import type { DeepenEstimate } from '../../../web/src/api/understanding.js';
import {
  allRoundsText,
  firstRoundText,
  overCapTexts,
} from '../../../web/src/lib/understanding/deepen-estimate-text.js';

// RF-209, RF-425, RF-427, DEC-145: the words for the estimate of a Deepen. All rounds are a working
// ceiling, not a maximum, and the run cap is named as what stops the run; a role without a price
// makes every figure a lower bound.

const point = (micros: number) => ({
  inputTokens: micros / 10,
  outputTokens: micros / 100,
  costMicros: String(micros),
});
const range = (low: number, likely: number, high: number) => ({
  low: point(low),
  likely: point(likely),
  high: point(high),
});
const role = (priced: boolean) => ({
  ...{ role: 'reader', provider: 'fake', kind: 'fake', model: 'm', keySource: 'user' },
  ...{ priced, ...range(1, 2, 3) },
});

function estimate(change: Partial<DeepenEstimate> = {}): DeepenEstimate {
  return {
    currency: 'USD',
    maxRounds: 3,
    coveragePass: true,
    plan: { judge: 10, reread: 40, outOfScope: 6, unreadFiles: 12, unreadTokens: 3000 },
    roles: [role(true)],
    round: range(200_000, 400_000, 900_000),
    allRounds: range(600_000, 1_200_000, 2_700_000),
    cap: { maxCostMicros: 2_000_000, maxTokens: 1_000_000 },
    overCap: { round: false, allRounds: false },
    ...change,
  };
}

describe('RF-209 the first round', () => {
  it('RF-209 gives the figures and what the round does', () => {
    expect(firstRoundText(estimate())).toBe(
      'First round: likely $0.40 (low $0.20, high $0.90). It judges 10 claims, re-reads 40 rejected claims and reads 12 first-party files never read (3,000 tokens). 6 rejected claims cite only third-party or generated code and are left out of scope.',
    );
  });

  it('RF-209 leaves out what the round does not do, and speaks of one in the singular', () => {
    const plan = { judge: 1, reread: 1, outOfScope: 0, unreadFiles: 0, unreadTokens: 0 };

    expect(firstRoundText(estimate({ plan }))).toBe(
      'First round: likely $0.40 (low $0.20, high $0.90). It judges 1 claim, re-reads 1 rejected claim.',
    );
  });

  it('RF-425 says at least when a model has no price', () => {
    expect(firstRoundText(estimate({ roles: [role(true), role(false)] }))).toContain(
      'likely at least $0.40 (low at least $0.20, high at least $0.90)',
    );
  });
});

describe('RF-209 all rounds', () => {
  it('RF-209 is a working ceiling, not a maximum, and names the run cap as what stops the run', () => {
    expect(allRoundsText(estimate())).toBe(
      'Up to 3 rounds: likely $1.20 (low $0.60, high $2.70). This is a working ceiling, not a maximum: a later round can need more than the first. The run cap of $2.00 is what stops the run (it also stops at 1,000,000 tokens).',
    );
  });

  it('RF-209 speaks of one round in the singular', () => {
    expect(allRoundsText(estimate({ maxRounds: 1 }))).toContain('Up to 1 round:');
  });
});

describe('RF-427 the warnings against the run cap', () => {
  it('RF-427 says nothing while both high figures are under the cap', () => {
    expect(overCapTexts(estimate())).toEqual([]);
  });

  it('RF-427 warns about all rounds alone', () => {
    expect(overCapTexts(estimate({ overCap: { round: false, allRounds: true } }))).toEqual([
      'The high figure for all rounds ($2.70) could pass the run cap ($2.00). The run stops cleanly at the cap and can be resumed.',
    ]);
  });

  it('RF-427 warns about the first round too when it could pass the cap', () => {
    const texts = overCapTexts(estimate({ overCap: { round: true, allRounds: true } }));

    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain('first round ($0.90)');
  });
});
