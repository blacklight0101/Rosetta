import { describe, expect, it } from 'vitest';
import {
  addMoney,
  compareMoney,
  formatUsd,
  microUsd,
  zeroUsd,
} from '../../../../src/domain/budget/money.js';

describe('Money', () => {
  it('RF-420 keeps integer micro-USD and starts at zero', () => {
    expect(microUsd(1_500_000n).micros).toBe(1_500_000n);
    expect(zeroUsd().micros).toBe(0n);
  });

  it('RF-420 adds exactly, with no floating-point drift', () => {
    const total = addMoney(microUsd(100_000n), microUsd(200_000n));

    expect(total.micros).toBe(300_000n);
    expect(addMoney(microUsd(1n), microUsd(2n)).micros).toBe(3n);
  });

  it('RF-420 adding leaves both operands unchanged', () => {
    const left = microUsd(5n);
    addMoney(left, microUsd(7n));

    expect(left.micros).toBe(5n);
  });

  it('RF-420 compares by amount', () => {
    expect(compareMoney(microUsd(1n), microUsd(2n))).toBe(-1);
    expect(compareMoney(microUsd(2n), microUsd(2n))).toBe(0);
    expect(compareMoney(microUsd(3n), microUsd(2n))).toBe(1);
  });

  it.each([
    [0n, '$0.0000'],
    [49n, '$0.0000'],
    [50n, '$0.0001'],
    [123n, '$0.0001'],
    [12_300n, '$0.0123'],
    [999_949n, '$0.9999'],
    [999_950n, '$1.00'],
    [1_000_000n, '$1.00'],
    [1_234_567n, '$1.23'],
    [1_004_999n, '$1.00'],
    [1_005_000n, '$1.01'],
    [1_234_567_890_123n, '$1234567.89'],
    [-1_500_000n, '-$1.50'],
    [-12_300n, '-$0.0123'],
  ])('RF-420 formats %s micro-USD as %s (4 decimals below 1, 2 above)', (micros, expected) => {
    expect(formatUsd(microUsd(micros))).toBe(expected);
  });
});
