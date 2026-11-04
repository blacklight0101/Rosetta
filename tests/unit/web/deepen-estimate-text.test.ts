import { describe, expect, it } from 'vitest';
import type { DeepenEstimate } from '../../../web/src/api/understanding.js';
import {
  confirmLineOf,
  deepenFiguresOf,
  overCapTexts,
  roundPlanText,
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
    plan: {
      judge: 10,
      reread: 40,
      outOfScope: 6,
      failedAreas: 0,
      answers: 0,
      unreadFiles: 12,
      unreadTokens: 3000,
    },
    roles: [role(true)],
    round: range(200_000, 400_000, 900_000),
    allRounds: range(600_000, 1_200_000, 2_700_000),
    cap: { maxCostMicros: 2_000_000, maxTokens: 1_000_000 },
    overCap: { round: false, allRounds: false },
    ...change,
  };
}

const withJourney = {
  journey: {
    approvedMicros: 4_000_000,
    remainingMicros: 3_962_940,
    approvedTokens: 4_000_000,
    remainingTokens: 3_900_000,
  },
};

describe('RF-209 what the first round does', () => {
  it('RF-209 says what the round does and leaves the figures to the panel', () => {
    expect(roundPlanText(estimate())).toBe(
      'It judges 10 claims, re-reads 40 rejected claims and reads 12 first-party files never read (3,000 tokens). 6 rejected claims cite only third-party or generated code and are left out of scope.',
    );
  });

  it('RF-209 leaves out what the round does not do, and speaks of one in the singular', () => {
    const plan = {
      ...{ judge: 1, reread: 1, outOfScope: 0, failedAreas: 0 },
      ...{ answers: 0, unreadFiles: 0, unreadTokens: 0 },
    };

    expect(roundPlanText(estimate({ plan }))).toBe('It judges 1 claim, re-reads 1 rejected claim.');
  });

  it('RF-209 DEC-179 says how many of the answers you gave the round uses, in the singular too', () => {
    const plan = {
      ...{ judge: 1, reread: 1, outOfScope: 0, failedAreas: 0 },
      ...{ answers: 3, unreadFiles: 0, unreadTokens: 0 },
    };

    expect(roundPlanText(estimate({ plan }))).toBe(
      'It judges 1 claim, re-reads 1 rejected claim. It uses 3 answers you already gave.',
    );
    expect(roundPlanText(estimate({ plan: { ...plan, answers: 1 } }))).toContain(
      'It uses 1 answer you already gave.',
    );
  });

  it('EV-10 RST-1303 says a round whose work is failed areas reads them again', () => {
    const plan = {
      ...{ judge: 0, reread: 0, outOfScope: 0, failedAreas: 2 },
      ...{ answers: 0, unreadFiles: 0, unreadTokens: 0 },
    };

    expect(roundPlanText(estimate({ plan }))).toBe(
      'It judges 0 claims, re-reads 0 rejected claims and reads again 2 areas that failed.',
    );
  });
});

describe('RF-434 the three figures of the panel', () => {
  it('RF-434 gives the first round, up to N rounds and what stops it, each once', () => {
    expect(deepenFiguresOf(estimate())).toEqual({
      first: 'likely $0.4000',
      all: 'likely $1.20',
      allLabel: 'Up to 3 rounds',
      stops: '$2.00 run cap',
      note: 'If a round would pass the run cap, the run stops cleanly at the cap and can be resumed.',
    });
  });

  it('RF-434 speaks of one round in the singular', () => {
    expect(deepenFiguresOf(estimate({ maxRounds: 1 })).allLabel).toBe('Up to 1 round');
  });

  it('RF-425 says at least when a model has no price', () => {
    expect(deepenFiguresOf(estimate({ roles: [role(true), role(false)] })).first).toBe(
      'likely at least $0.4000',
    );
  });

  it('RF-434 DEC-206 says what stops it with the approved amount left, not the project run cap', () => {
    expect(deepenFiguresOf(estimate(withJourney))).toMatchObject({
      stops: '$3.96 left of $4.00',
      note: 'If a round would pass the approved amount, the run pauses and asks you before it spends more.',
    });
  });

  it('RF-434 counts tokens when the journey is on local models', () => {
    const local = estimate({
      journey: { ...withJourney.journey, approvedMicros: 0, remainingMicros: 0 },
      roles: [{ ...role(true), kind: 'ollama' }],
    });

    expect(deepenFiguresOf(local).stops).toBe('3,900,000 tokens left of 4,000,000');
  });
});

describe('RF-434 the one line of the confirmation', () => {
  it('RF-434 gives the likely cost and the amount left in one line', () => {
    expect(confirmLineOf(estimate(withJourney))).toBe(
      'Up to 3 rounds, likely $1.20. It stops at the $3.96 left of your $4.00 approval.',
    );
  });

  it('RF-434 names the run cap for a run outside a journey', () => {
    expect(confirmLineOf(estimate())).toBe(
      'Up to 3 rounds, likely $1.20. It stops at the run cap of $2.00.',
    );
  });
});

describe('RF-427 the warning against the amount that applies', () => {
  it('RF-427 says nothing while both high figures are under the amount', () => {
    expect(overCapTexts(estimate())).toEqual([]);
  });

  it('RF-427 warns once, about all rounds, against the run cap outside a journey', () => {
    expect(overCapTexts(estimate({ overCap: { round: false, allRounds: true } }))).toEqual([
      'The high figure for all rounds ($2.70) could pass the run cap ($2.00). The run stops cleanly at the cap and can be resumed.',
    ]);
  });

  it('RF-434 warns once even when the first round could pass it too', () => {
    const texts = overCapTexts(estimate({ overCap: { round: true, allRounds: true } }));

    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('all rounds ($2.70)');
  });

  it('RF-434 warns against the approved amount left, and says the run pauses and asks', () => {
    const texts = overCapTexts(
      estimate({ ...withJourney, overCap: { round: false, allRounds: true } }),
    );

    expect(texts).toEqual([
      'The high figure for all rounds ($2.70) could pass the $3.96 left of your $4.00 approval. The run pauses and asks you before it spends more.',
    ]);
  });
});
