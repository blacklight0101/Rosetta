// RF-420, DEC-54: cost is an integer count of micro-USD (millionths of a dollar). Amounts are
// bigint so no floating-point value ever represents a cost; the only division is bigint integer
// division, used to round for display.

export interface Money {
  readonly micros: bigint;
  readonly currency: 'USD';
}

const MICROS_PER_DOLLAR = 1_000_000n;
const MICROS_PER_TEN_THOUSANDTH = 100n;
const MICROS_PER_CENT = 10_000n;

export function microUsd(micros: bigint): Money {
  return { micros, currency: 'USD' };
}

export function zeroUsd(): Money {
  return { micros: 0n, currency: 'USD' };
}

export function addMoney(left: Money, right: Money): Money {
  return { micros: left.micros + right.micros, currency: 'USD' };
}

export function compareMoney(left: Money, right: Money): -1 | 0 | 1 {
  if (left.micros < right.micros) return -1;
  return left.micros > right.micros ? 1 : 0;
}

/** Rounds half up (on the absolute amount) to a whole number of `unit` micros. */
function roundedUnits(absMicros: bigint, unit: bigint): bigint {
  return (absMicros + unit / 2n) / unit;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+$)/g, ',');
}

function withDecimals(units: bigint, decimals: number): string {
  const digits = units.toString().padStart(decimals + 1, '0');
  const whole = groupThousands(digits.slice(0, digits.length - decimals));
  return `${whole}.${digits.slice(digits.length - decimals)}`;
}

/** Four decimals below one dollar, two from one dollar up (data-model.md section 1). */
export function formatUsd(money: Money): string {
  const sign = money.micros < 0n ? '-' : '';
  const abs = money.micros < 0n ? -money.micros : money.micros;
  if (abs < MICROS_PER_DOLLAR) {
    const tenThousandths = roundedUnits(abs, MICROS_PER_TEN_THOUSANDTH);
    if (tenThousandths * MICROS_PER_TEN_THOUSANDTH < MICROS_PER_DOLLAR) {
      return `${sign}$${withDecimals(tenThousandths, 4)}`;
    }
  }
  return `${sign}$${withDecimals(roundedUnits(abs, MICROS_PER_CENT), 2)}`;
}
