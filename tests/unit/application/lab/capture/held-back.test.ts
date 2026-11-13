import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../../src/infrastructure/lab/run-folder.js';
import { heldBackIds } from '../../../../../src/application/lab/capture/held-back.js';

// RF-1405, DEC-231: the held-back part is fixed by a rule that reads no input.

const ids = Array.from({ length: 10 }, (_, index) => `case-${String(index)}`);

describe('the held-back rule', () => {
  it('RF-1405 holds back at least a third of the cases, rounded up', () => {
    expect(heldBackIds('planner/gap', ids, sha256Hex).size).toBe(4);
    expect(heldBackIds('planner/gap', ids.slice(0, 3), sha256Hex).size).toBe(1);
    expect(heldBackIds('planner/gap', ids.slice(0, 1), sha256Hex).size).toBe(1);
  });

  it('RF-1405 gives the same split whatever the order of the ids', () => {
    const forward = [...heldBackIds('planner/gap', ids, sha256Hex)].sort();
    const backward = [...heldBackIds('planner/gap', [...ids].reverse(), sha256Hex)].sort();

    expect(backward).toEqual(forward);
  });

  it('RF-1405 depends on the prompt id and the case id only', () => {
    const one = [...heldBackIds('planner/gap', ids, sha256Hex)].sort();
    const other = [...heldBackIds('summariser/merge', ids, sha256Hex)].sort();

    expect(other).not.toEqual(one);
    expect(one.every((id) => ids.includes(id))).toBe(true);
  });
});
