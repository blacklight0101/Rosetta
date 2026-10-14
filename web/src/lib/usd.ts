// DEC-54, DEC-107, DEC-117, data-model.md section 1: amounts travel as decimal strings of micro-dollars and
// are typed and shown in dollars. The conversion works on the digits, never through a float, so no
// micro-dollar is lost.

const microsPerDollar = 1_000_000n;
const fractionDigits = 6;
/** The run cost cap range of DEC-117: 0 to 100 USD (100,000,000 micros). */
export const RUN_COST_MAX_MICROS = 100_000_000n;

// An optional minus sign (refused by the server on its field, RST-1003), an optional dollar sign,
// whole dollars with either no separator or thousands separators in groups of three (the first
// group does not start with a zero), and up to six decimals after a dot that has digits before it.
const amountPattern = /^(-?)\$?([1-9]\d{0,2}(?:,\d{3})+|\d+)(?:\.(\d{1,6}))?$/u;

/**
 * Dollars as typed (`2.5`, `$2.50`, `1,200`, `-1`) to micro-dollars; undefined when it is not an
 * amount, or when a positive amount is above `maxMicros` (pass RUN_COST_MAX_MICROS for a run cost
 * cap). A negative amount is returned whatever its size, so the server refuses it with RST-1003
 * on its field.
 */
export function dollarsToMicros(text: string, maxMicros?: bigint): string | undefined {
  const match = amountPattern.exec(text.trim());
  if (match === null) return undefined;
  const [, sign = '', whole = '0', fraction = ''] = match;
  const magnitude =
    BigInt(whole.replaceAll(',', '')) * microsPerDollar +
    BigInt(fraction.padEnd(fractionDigits, '0'));
  if (sign === '-') return magnitude === 0n ? '0' : `-${magnitude.toString()}`;
  if (maxMicros !== undefined && magnitude > maxMicros) return undefined;
  return magnitude.toString();
}

/** Micro-dollars to dollars with at least the cents and no trailing zeros beyond them. */
export function microsToDollars(micros: string): string {
  const value = BigInt(micros);
  const whole = (value / microsPerDollar).toString();
  const fraction = (value % microsPerDollar).toString().padStart(fractionDigits, '0');
  const trimmed = fraction.replace(/0+$/u, '').padEnd(2, '0');
  return `${whole}.${trimmed}`;
}
