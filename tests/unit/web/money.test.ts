import { describe, expect, it } from 'vitest';
import { formatMoney, priceTableText } from '../../../web/src/lib/money.js';

// RF-428, RF-1020, DEC-54, DEC-217, design-system.md section 10: one formatter for every money amount,
// four decimals below $1 and two above, exactly zero as `$0.00` and a non-zero amount below $0.00005 as
// `<$0.0001`, with the exact figure kept for the tooltip.

describe('money formatter', () => {
  it.each([
    ['237000', '$0.2370', '$0.237'],
    ['3113515', '$3.11', '$3.113515'],
    ['37100', '$0.0371', '$0.0371'],
    ['0', '$0.00', '$0.00'],
    ['7', '<$0.0001', '$0.000007'],
    ['49', '<$0.0001', '$0.000049'],
    ['50', '$0.0001', '$0.00005'],
    ['3880000', '$3.88', '$3.88'],
    ['1000000', '$1.00', '$1.00'],
    ['1234567890', '$1,234.57', '$1234.56789'],
  ])('RF-428 writes %s micro-dollars as %s with the exact figure %s', (micros, text, exact) => {
    expect(formatMoney(micros)).toEqual({ text, exact });
  });

  it('RF-428 given any money amount, rounds half up and never shows four decimals for an amount that rounds to a dollar', () => {
    expect(formatMoney('123450').text).toBe('$0.1235');
    expect(formatMoney('123449').text).toBe('$0.1234');
    expect(formatMoney('999960').text).toBe('$1.00');
    expect(formatMoney('1005000').text).toBe('$1.01');
  });

  it('RF-428 given exactly zero or an amount below $0.00005, never reads a non-zero amount as zero', () => {
    expect(formatMoney('0').text).toBe('$0.00');
    expect(formatMoney('1').text).toBe('<$0.0001');
    expect(formatMoney('49').text).toBe('<$0.0001');
    expect(formatMoney('50').text).toBe('$0.0001');
    expect(formatMoney('0').text).not.toBe(formatMoney('7').text);
  });

  it('RF-428 given a price table version, names a date version as a day, month and year, and keeps any other text', () => {
    expect(priceTableText('2026-10-21')).toBe('21 Oct 2026');
    expect(priceTableText('2026-10-05')).toBe('5 Oct 2026');
    expect(priceTableText('v2')).toBe('v2');
  });
});
