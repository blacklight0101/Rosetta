import { expect, it } from 'vitest';
import { topBarMeterOf } from '../../../web/src/lib/live-run/top-bar-meter.js';

// RF-1003, RF-1010, DEC-49, design-system.md section 5 (cost meter): the run meter of the top bar
// shows what the run spent against its cap; it warns from 80% and is in danger from 95%.

it('RF-1003 shows spent, cap and share of the cap', () => {
  const meter = topBarMeterOf(412_000, 2_000_000);

  expect(meter).toMatchObject({ share: 21, level: 'ok', spent: '$0.412', cap: '$2.00' });
  expect(meter.valueText).toBe('$0.412 of $2.00 (21%)');
});

it.each([
  [1_599_999, 'ok'],
  [1_600_000, 'warn'],
  [1_899_999, 'warn'],
  [1_900_000, 'danger'],
  [2_000_000, 'danger'],
] as const)('RF-1003 %i micros of a $2.00 cap is %s', (cost, level) => {
  expect(topBarMeterOf(cost, 2_000_000).level).toBe(level);
});

it('RF-1003 a run over its cap shows 100% and not more', () => {
  expect(topBarMeterOf(2_500_000, 2_000_000)).toMatchObject({ share: 100, level: 'danger' });
});

it('RF-1003 the value text says the level in words, so colour is not the only signal', () => {
  expect(topBarMeterOf(1_700_000, 2_000_000).valueText).toContain('approaching the cap');
  expect(topBarMeterOf(1_950_000, 2_000_000).valueText).toContain('at the cap');
});

// P5-07: a run on local models only has tokens, so its meter counts tokens against the token cap.
it('P5-07 a local run meter counts tokens against the token cap and names no dollars', () => {
  const meter = topBarMeterOf(1_200_000, 2_000_000, 'tokens');

  expect(meter).toMatchObject({ share: 60, level: 'ok', spent: '1,200,000 tokens' });
  expect(meter.cap).toBe('2,000,000 tokens');
  expect(meter.valueText).toBe('1,200,000 tokens of 2,000,000 tokens (60%)');
});
