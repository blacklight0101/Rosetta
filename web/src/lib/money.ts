import { microsToDollars } from './usd.js';

// RF-428, RF-1020, DEC-54, design-system.md section 10: the one way a money amount is written.
// Four decimals below $1 and two above, thousands separators, rounded half up on the digits (never
// through a float); the exact figure goes in a tooltip. An amount that rounds up to a dollar is
// written as a dollar amount, so $0.99996 reads `$1.00`, never `$1.0000`.

const hundredth = 10_000n;
const tenThousandth = 100n;
const fourDecimalsMax = 10_000n;
const halfUp = (micros: bigint, unit: bigint): bigint => (micros + unit / 2n) / unit;

export interface Money {
  /** The amount as shown, for example `$3.11` or `$0.2370`. */
  readonly text: string;
  /** The exact figure for the tooltip, for example `$3.113515`. */
  readonly exact: string;
}

/** Micro-dollars (a decimal string, as the server sends them) to the text shown and the exact figure. */
export function formatMoney(micros: string): Money {
  const value = BigInt(micros);
  const exact = `$${microsToDollars(micros)}`;
  const fractions = halfUp(value, tenThousandth);
  if (fractions < fourDecimalsMax) {
    return { text: `$0.${fractions.toString().padStart(4, '0')}`, exact };
  }
  const cents = halfUp(value, hundredth);
  const dollars = (cents / 100n).toLocaleString('en-US');
  return { text: `$${dollars}.${(cents % 100n).toString().padStart(2, '0')}`, exact };
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
