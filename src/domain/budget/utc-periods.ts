import type { EpochMs } from '../accounts/user.js';

// DEC-107, RF-1106: the daily and monthly caps sum UTC calendar days and months. Each period is
// [start, end) in epoch milliseconds.

export interface UtcPeriods {
  readonly dayStart: EpochMs;
  readonly dayEnd: EpochMs;
  readonly monthStart: EpochMs;
  readonly monthEnd: EpochMs;
}

// RF-1106
export function utcPeriodsOf(at: Date): UtcPeriods {
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth();
  const day = at.getUTCDate();
  return {
    dayStart: Date.UTC(year, month, day),
    dayEnd: Date.UTC(year, month, day + 1),
    monthStart: Date.UTC(year, month, 1),
    monthEnd: Date.UTC(year, month + 1, 1),
  };
}
