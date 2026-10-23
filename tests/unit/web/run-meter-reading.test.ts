import { expect, it } from 'vitest';
import { runMeterReadingOf } from '../../../web/src/lib/live-run/run-meter-reading.js';

// RF-1003, P5-07: the reading the top bar meter takes from a run. A run on local models only has
// tokens, so its reading is tokens against the token cap; a run with a priced model keeps dollars.

it('P5-07 a local run reads its tokens against the token cap', () => {
  expect(
    runMeterReadingOf({
      caps: { maxCostMicros: 2_000_000, maxTokens: 500_000 },
      costMicros: 0,
      tokens: 120_000,
      local: true,
    }),
  ).toEqual({ spent: 120_000, cap: 500_000, unit: 'tokens' });
});

it('RF-1003 a priced run keeps its cost against the cost cap', () => {
  expect(
    runMeterReadingOf({
      caps: { maxCostMicros: 2_000_000, maxTokens: 500_000 },
      costMicros: 412_000,
      tokens: 120_000,
      local: false,
    }),
  ).toEqual({ spent: 412_000, cap: 2_000_000, unit: 'micros' });
});

it('RF-1003 no reading when the cap that the run uses is not set', () => {
  expect(
    runMeterReadingOf({
      caps: { maxCostMicros: 0, maxTokens: 500_000 },
      costMicros: 0,
      tokens: 0,
      local: false,
    }),
  ).toBeUndefined();
  expect(
    runMeterReadingOf({
      caps: { maxCostMicros: 2_000_000, maxTokens: 0 },
      costMicros: 0,
      tokens: 0,
      local: true,
    }),
  ).toBeUndefined();
});
