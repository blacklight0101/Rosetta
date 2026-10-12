import type { Money } from '../api/admin-schemas.js';

// RF-1106: the server's month to date against its monthly cap. The month to date is the server-key
// spend the API totals (spend on users' own keys does not count against the server cap); the page
// adds up its dollars (this release prices in dollars) and warns the administrator from 80%.
// Everything is whole micro-dollars (bigint), so nothing is rounded.

const warnPercent = 80n;

export interface ServerMonth {
  readonly usedMicros: bigint;
  readonly capMicros: bigint;
  /** Whole percent of the cap used, at most 100 (the meter's width). */
  readonly percent: number;
  /** True from 80% of a cap above zero. */
  readonly warn: boolean;
}

// RF-1106
export function serverMonthOf(serverSpent: readonly Money[], capMicros: bigint): ServerMonth {
  const usedMicros = serverSpent
    .filter((money) => money.currency === 'USD')
    .reduce((sum, money) => sum + BigInt(money.costMicros), 0n);
  if (capMicros <= 0n) return { usedMicros, capMicros, percent: 100, warn: false };
  const percent = Number((usedMicros * 100n) / capMicros);
  return {
    usedMicros,
    capMicros,
    percent: Math.min(percent, 100),
    warn: usedMicros * 100n >= capMicros * warnPercent,
  };
}
