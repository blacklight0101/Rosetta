import { describe, expect, it } from 'vitest';
import {
  ALL_CASES,
  describeSelection,
  sameSelection,
  selectCases,
} from '../../../../src/application/lab/lab-selection.js';

// RF-1409: which cases of a set a lab run sends: one side, a deterministic sample, or both.

const cases = [
  { id: 'c-03', split: 'tune' },
  { id: 'c-01', split: 'held-back' },
  { id: 'c-10', split: 'tune' },
  { id: 'c-02', split: 'tune' },
] as const;

const ids = (selected: readonly { id: string }[]): string[] => selected.map((each) => each.id);

describe('the selection of cases', () => {
  it('RF-1409 keeps every case, in the order of the set, when nothing is asked', () => {
    expect(ids(selectCases(cases, ALL_CASES))).toEqual(['c-03', 'c-01', 'c-10', 'c-02']);
  });

  it('RF-1409 keeps only the cases of one side', () => {
    expect(ids(selectCases(cases, { split: 'tune', sample: null }))).toEqual([
      'c-03',
      'c-10',
      'c-02',
    ]);
    expect(ids(selectCases(cases, { split: 'held-back', sample: null }))).toEqual(['c-01']);
  });

  it('RF-1409 samples the first n cases by id, whatever the order of the set', () => {
    expect(ids(selectCases(cases, { split: 'tune', sample: 2 }))).toEqual(['c-02', 'c-03']);
    expect(ids(selectCases([...cases].reverse(), { split: 'tune', sample: 2 }))).toEqual([
      'c-02',
      'c-03',
    ]);
  });

  it('RF-1409 makes a smaller sample a prefix of a larger one and takes all when n is too large', () => {
    const small = ids(selectCases(cases, { split: 'all', sample: 1 }));
    const large = ids(selectCases(cases, { split: 'all', sample: 3 }));

    expect(small).toEqual(['c-01']);
    expect(large.slice(0, 1)).toEqual(small);
    expect(ids(selectCases(cases, { split: 'tune', sample: 50 }))).toHaveLength(3);
  });

  it('RF-1409 tells two selections apart and reads a missing one as every case', () => {
    expect(sameSelection(undefined, ALL_CASES)).toBe(true);
    expect(sameSelection({ split: 'tune', sample: 2 }, { split: 'tune', sample: 2 })).toBe(true);
    expect(sameSelection({ split: 'tune', sample: 2 }, { split: 'tune', sample: 3 })).toBe(false);
    expect(sameSelection({ split: 'tune', sample: null }, ALL_CASES)).toBe(false);
    expect(describeSelection({ split: 'tune', sample: 2 })).toBe('split tune, sample 2');
    expect(describeSelection(ALL_CASES)).toBe('every case');
  });
});
