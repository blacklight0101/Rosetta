// RNF-015: every measure of an evaluation is rounded to six decimals, so the same runs always give
// the same text in the result files, and a ratio with nothing to divide by is null, never 0 or NaN.

const SCALE = 1_000_000;

export function rounded(value: number): number {
  const result = Math.round(value * SCALE) / SCALE;
  return Object.is(result, -0) ? 0 : result;
}

/** `part / whole` rounded, or null when `whole` is zero. */
export function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : rounded(part / whole);
}
