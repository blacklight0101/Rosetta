import { expect, it } from 'vitest';
import { serverMonthOf } from '../../../web/src/pages/admin-month.js';

// RF-1106: the server month to date against its cap; the administrator sees a warning from 80%.

const usd = (costMicros: string) => ({ monthToDate: [{ currency: 'USD', costMicros }] });

it('RF-1106 adds the month to date of every account in dollars and ignores other currencies', () => {
  const month = serverMonthOf(
    [usd('4950000'), usd('2100000'), { monthToDate: [{ currency: 'EUR', costMicros: '9000000' }] }],
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
