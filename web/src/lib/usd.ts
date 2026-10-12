// DEC-54, DEC-107, data-model.md section 1: amounts travel as decimal strings of micro-dollars and
// are typed and shown in dollars. The conversion works on the digits, never through a float, so no
// micro-dollar is lost.

const microsPerDollar = 1_000_000n;
const fractionDigits = 6;

/** Dollars as typed (`2.5`, `$2.50`, `1,200`) to micro-dollars; undefined when it is not an amount. */
export function dollarsToMicros(text: string): string | undefined {
  const plain = text.trim().replace(/^\$/u, '').replaceAll(',', '');
  const match = /^(\d+)(?:\.(\d{1,6}))?$/u.exec(plain);
  if (match === null) return undefined;
  const [, whole = '0', fraction = ''] = match;
  const micros = BigInt(whole) * microsPerDollar + BigInt(fraction.padEnd(fractionDigits, '0'));
  return micros.toString();
}

/** Micro-dollars to dollars with at least the cents and no trailing zeros beyond them. */
export function microsToDollars(micros: string): string {
  const value = BigInt(micros);
  const whole = (value / microsPerDollar).toString();
  const fraction = (value % microsPerDollar).toString().padStart(fractionDigits, '0');
  const trimmed = fraction.replace(/0+$/u, '').padEnd(2, '0');
  return `${whole}.${trimmed}`;
}
