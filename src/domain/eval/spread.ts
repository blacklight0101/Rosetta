import { rounded } from './ratio.js';

// RNF-015: each golden case runs at least three times and the report shows the spread: the count,
// the smallest and largest value, the mean and the population standard deviation, rounded to six
// decimals. A repetition without a value (nothing to divide by) is left out; no value, no spread.

export interface Spread {
  readonly n: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly stdDev: number;
}

// RNF-015
export function spreadOf(values: readonly (number | null)[]): Spread | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  const mean = present.reduce((sum, value) => sum + value, 0) / present.length;
  const variance = present.reduce((sum, value) => sum + (value - mean) ** 2, 0) / present.length;
  return {
    n: present.length,
    min: Math.min(...present),
    max: Math.max(...present),
    mean: rounded(mean),
    stdDev: rounded(Math.sqrt(variance)),
  };
}
