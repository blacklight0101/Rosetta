import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../../src/infrastructure/lab/run-folder.js';
import {
  canonicalJson,
  heldBackKey,
  inputKey,
  splitsOf,
} from '../../../../../src/application/lab/capture/held-back.js';

// RF-1405, ADR-029: the side of a case is a function of its canonical input alone, so a case, its
// twin and the same input in any other set always fall on the same side.

const inputs = Array.from({ length: 300 }, (_, index) => ({ area: `a${String(index)}`, turns: 6 }));
const held = (splits: readonly string[]): number =>
  splits.filter((each) => each === 'held-back').length;

describe('the held-back rule', () => {
  it('RF-1405 holds back an input whose hash falls in the lowest third of the hash space', () => {
    const third = '5'.repeat(64);

    expect(heldBackKey('0'.repeat(64))).toBe(true);
    expect(heldBackKey(third)).toBe(true);
    expect(heldBackKey(`${'5'.repeat(63)}6`)).toBe(false);
    expect(heldBackKey('f'.repeat(64))).toBe(false);
  });

  it('RF-1405 holds back about a third of many inputs', () => {
    const count = held(splitsOf(inputs, sha256Hex));

    expect(count).toBeGreaterThan(70);
    expect(count).toBeLessThan(130);
  });

  it('RF-1405 gives an input the same side in every set that holds it, whatever else the set holds', () => {
    const all = splitsOf(inputs, sha256Hex);
    const first = splitsOf(inputs.slice(0, 3), sha256Hex);
    const shifted = splitsOf(inputs.slice(1, 4), sha256Hex);

    expect(first).toEqual(all.slice(0, 3));
    expect(shifted).toEqual(all.slice(1, 4));
    expect(splitsOf([...inputs].reverse(), sha256Hex).reverse()).toEqual(all);
  });

  it('RF-1405 puts twins on the same side', () => {
    const twins = [...inputs, ...inputs.map((each) => ({ turns: each.turns, area: each.area }))];

    const splits = splitsOf(twins, sha256Hex);

    expect(splits.slice(300)).toEqual(splits.slice(0, 300));
  });

  it('RF-1405 reads the input only: the canonical JSON sorts the keys at every level', () => {
    const one = { b: [{ y: 1, x: 2 }], a: 'z' };
    const other = { a: 'z', b: [{ x: 2, y: 1 }] };

    expect(canonicalJson(one)).toBe('{"a":"z","b":[{"x":2,"y":1}]}');
    expect(inputKey(one, sha256Hex)).toBe(inputKey(other, sha256Hex));
    expect(inputKey(one, sha256Hex)).not.toBe(inputKey({ ...one, a: 'y' }, sha256Hex));
  });
});
