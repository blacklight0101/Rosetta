import { microsToDollars } from './usd.js';

// RF-428, RF-1020, DEC-54, DEC-217, design-system.md section 10: the one way a money amount is
// written. Four decimals below $1 and two above, thousands separators, rounded half up on the digits
// (never through a float); the exact figure goes in a tooltip. An amount that rounds up to a dollar
// is written as a dollar amount, so $0.99996 reads `$1.00`, never `$1.0000`. Exactly zero reads
// `$0.00` and a non-zero amount below $0.00005 reads `<$0.0001`, so a cost never reads as zero by
// rounding. An amount left of an approved amount rounds down instead (`down`), so what is shown never
// exceeds what is left (DEC-206).

const hundredth = 10_000n;
const tenThousandth = 100n;
const fourDecimalsMax = 10_000n;

/** How an amount is cut to the digits shown: half up, or down for an amount left of an approval. */
export type Rounding = 'nearest' | 'down';

const rounded = (micros: bigint, unit: bigint, rounding: Rounding): bigint =>
  rounding === 'down' ? micros / unit : (micros + unit / 2n) / unit;

export interface Money {
  /** The amount as shown, for example `$3.11` or `$0.2370`. */
  readonly text: string;
  /** The exact figure for the tooltip, for example `$3.113515`. */
  readonly exact: string;
}

/** Micro-dollars (a decimal string, as the server sends them) to the text shown and the exact figure. */
export function formatMoney(micros: string, rounding: Rounding = 'nearest'): Money {
  const value = BigInt(micros);
  const exact = `$${microsToDollars(micros)}`;
  if (value === 0n) return { text: '$0.00', exact };
  const fractions = rounded(value, tenThousandth, rounding);
  if (fractions === 0n) return { text: '<$0.0001', exact };
  if (fractions < fourDecimalsMax) {
    return { text: `$0.${fractions.toString().padStart(4, '0')}`, exact };
  }
  const cents = rounded(value, hundredth, rounding);
  const dollars = (cents / 100n).toLocaleString('en-US');
  return { text: `$${dollars}.${(cents % 100n).toString().padStart(2, '0')}`, exact };
}

/** The amount as shown, for micro-dollars as a number (rounded to a micro-dollar), a bigint or a decimal string. */
export function moneyText(
  micros: number | bigint | string,
  rounding: Rounding = 'nearest',
): string {
  const digits = typeof micros === 'number' ? String(Math.round(micros)) : String(micros);
  return formatMoney(digits, rounding).text;
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const versionPattern = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** A price table version, which is the date of its prices, as `21 Oct 2026`; any other text as it is. */
export function priceTableText(version: string): string {
  const match = versionPattern.exec(version);
  const month = months[Number(match?.[2]) - 1];
  if (match === null || month === undefined) return version;
  return `${String(Number(match[3]))} ${month} ${match[1] ?? ''}`;
}
