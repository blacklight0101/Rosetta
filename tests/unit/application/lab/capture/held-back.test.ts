import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../../src/infrastructure/lab/run-folder.js';
import {
  canonicalJson,
  inputKey,
  splitsOf,
} from '../../../../../src/application/lab/capture/held-back.js';

// RF-1405, ADR-029: the held-back part is fixed by a rule on the canonical input of a case, so a
// case and its twin (the same input under another id) always fall on the same side.

const inputs = Array.from({ length: 10 }, (_, index) => ({ area: `a${String(index)}`, turns: 6 }));
const held = (splits: readonly string[]): number =>
  splits.filter((each) => each === 'held-back').length;

describe('the held-back rule', () => {
  it('RF-1405 holds back a third of the distinct inputs, rounded up', () => {
    expect(held(splitsOf(inputs, sha256Hex))).toBe(4);
    expect(held(splitsOf(inputs.slice(0, 3), sha256Hex))).toBe(1);
    expect(held(splitsOf(inputs.slice(0, 1), sha256Hex))).toBe(1);
  });

  it('RF-1405 gives each input the same side whatever the order of the cases', () => {
    const forward = splitsOf(inputs, sha256Hex);
    const backward = splitsOf([...inputs].reverse(), sha256Hex).reverse();

    expect(backward).toEqual(forward);
  });

  it('RF-1405 puts twins on the same side and counts them once', () => {
    const twins = [...inputs, ...inputs.map((each) => ({ turns: each.turns, area: each.area }))];

    const splits = splitsOf(twins, sha256Hex);

    expect(splits.slice(10)).toEqual(splits.slice(0, 10));
    expect(held(splits)).toBe(8);
  });

  it('RF-1405 reads the input only: the canonical JSON sorts the keys at every level', () => {
    const one = { b: [{ y: 1, x: 2 }], a: 'z' };
    const other = { a: 'z', b: [{ x: 2, y: 1 }] };

    expect(canonicalJson(one)).toBe('{"a":"z","b":[{"x":2,"y":1}]}');
    expect(inputKey(one, sha256Hex)).toBe(inputKey(other, sha256Hex));
    expect(inputKey(one, sha256Hex)).not.toBe(inputKey({ ...one, a: 'y' }, sha256Hex));
  });
});
