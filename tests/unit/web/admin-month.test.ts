import { expect, it } from 'vitest';
import { serverMonthOf } from '../../../web/src/pages/admin-month.js';

// RF-1106: the server month to date (server-key spend, as the API totals it) against its cap; the
// administrator sees a warning from 80%.

const usd = (costMicros: string) => ({ currency: 'USD', costMicros });

it('RF-1106 totals the dollars of the server month and ignores other currencies', () => {
  const month = serverMonthOf(
    [usd('7050000'), { currency: 'EUR', costMicros: '9000000' }],
    10_000_000n,
  );

  expect(month).toMatchObject({ usedMicros: 7_050_000n, capMicros: 10_000_000n, warn: false });
});

it('RF-1106 warns at 80% of the monthly cap and not below it', () => {
  expect(serverMonthOf([usd('7999999')], 10_000_000n).warn).toBe(false);
  expect(serverMonthOf([usd('8000000')], 10_000_000n).warn).toBe(true);
  expect(serverMonthOf([usd('8200000')], 10_000_000n).percent).toBe(82);
});

it('RF-1106 a cap of zero never warns and the meter stays full width at most', () => {
  expect(serverMonthOf([usd('1')], 0n)).toMatchObject({ warn: false, percent: 100 });
  expect(serverMonthOf([usd('30000000')], 10_000_000n).percent).toBe(100);
});

it('RF-1106 a month without server-key spend is zero', () => {
  expect(serverMonthOf([], 10_000_000n)).toMatchObject({ usedMicros: 0n, percent: 0, warn: false });
});
