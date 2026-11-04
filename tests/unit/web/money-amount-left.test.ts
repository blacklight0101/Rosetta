import { describe, expect, it } from 'vitest';
import type { DeepenEstimate } from '../../../web/src/api/understanding.js';
import { approvedLineOf, approvedViewOf } from '../../../web/src/lib/live-run/approved-line.js';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { deepenFiguresOf } from '../../../web/src/lib/understanding/deepen-estimate-text.js';
import { formatMoney, moneyText } from '../../../web/src/lib/money.js';
import { formatAmount } from '../../../web/src/pages/setting-limits.js';
import { facts, projectId } from './journey-fixtures.js';

// RF-428, DEC-206, P8-24, P8-91: an amount left of the approved amount is rounded down, so the amount
// shown never exceeds what is left. Every other amount rounds half up.

const budget = (remainingMicros: number) => ({
  approvedMicros: 4_000_000,
  remainingMicros,
  approvedTokens: 4_000_000,
  remainingTokens: 3_900_000,
});

describe('the one formatter with a rounding down option', () => {
  it.each([
    ['3965000', '$3.96', '$3.97'],
    ['999960', '$0.9999', '$1.00'],
    ['3962940', '$3.96', '$3.96'],
    ['237000', '$0.2370', '$0.2370'],
    ['7', '<$0.0001', '<$0.0001'],
    ['0', '$0.00', '$0.00'],
  ])(
    'RF-428 writes %s micro-dollars as %s rounded down and %s rounded half up',
    (micros, down, up) => {
      expect(formatMoney(micros, 'down').text).toBe(down);
      expect(formatMoney(micros).text).toBe(up);
      expect(moneyText(micros, 'down')).toBe(down);
      expect(moneyText(micros)).toBe(up);
    },
  );

  it('RF-428 keeps the exact figure the same whichever way it rounds', () => {
    expect(formatMoney('3965000', 'down').exact).toBe(formatMoney('3965000').exact);
  });
});

describe('the amount left of the approved amount rounds down', () => {
  it.each([
    [3_965_000, '$3.96 left of $4.00 approved'],
    [999_960, '$0.9999 left of $4.00 approved'],
  ])('RF-428 the live run says %s micro-dollars left as "%s"', (remaining, text) => {
    expect(approvedViewOf(approvedLineOf(budget(remaining)), 'micros')?.text).toBe(text);
  });

  it.each([
    [3_965_000, '$3.96 left of $4.00 approved'],
    [999_960, '$0.9999 left of $4.00 approved'],
  ])('RF-428 the journey says %s micro-dollars left as "%s"', (remaining, text) => {
    expect(journeyOf(facts({ budget: budget(remaining) }), projectId).left).toBe(text);
  });

  it.each([
    [3_965_000, '$3.96 left of $4.00'],
    [999_960, '$0.9999 left of $4.00'],
  ])('RF-428 the Deepen estimate says %s micro-dollars left as "%s"', (remaining, text) => {
    const journey = budget(remaining);
    const estimate = {
      currency: 'USD',
      maxRounds: 3,
      coveragePass: true,
      plan: {
        judge: 1,
        reread: 1,
        outOfScope: 0,
        failedAreas: 0,
        answers: 0,
        unreadFiles: 0,
        unreadTokens: 0,
      },
      roles: [],
      round: { low: point(1), likely: point(2), high: point(3) },
      allRounds: { low: point(1), likely: point(2), high: point(3) },
      cap: { maxCostMicros: 2_000_000, maxTokens: 1_000_000 },
      overCap: { round: false, allRounds: false },
      journey,
    } satisfies DeepenEstimate;

    expect(deepenFiguresOf(estimate).stops).toBe(text);
  });
});

describe('a sentence that compares two limits', () => {
  it('RF-428 writes an amount in all its digits when rounding would hide the difference, the one place with three decimals', () => {
    expect(formatAmount(1.004, 'dollars')).toBe('$1.004');
    expect(formatAmount(1, 'dollars')).toBe('$1.00');
  });
});

function point(micros: number) {
  return { inputTokens: micros, outputTokens: micros, costMicros: String(micros) };
}
