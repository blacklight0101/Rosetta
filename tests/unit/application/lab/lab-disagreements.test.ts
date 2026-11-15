import { describe, expect, it } from 'vitest';
import { disagreementsOf } from '../../../../src/application/lab/lab-disagreements.js';

// RF-1411: the cases that differ from their expected label, counted by pair, so a false
// "supported" and a false "not supported" verdict are two figures, not one agreement rate.

const one = (expected: string | null, detail: string) => ({ expected, detail });

describe('the disagreements of a lab run', () => {
  it('RF-1411 counts each pair of expected label and label, in code-unit order', () => {
    const cases = [
      one('Rejected', 'Supported'),
      one('Rejected', 'Supported'),
      one('Supported', 'Rejected'),
      one('Supported', 'Unverified'),
      one('Supported', 'Supported'),
    ];

    expect(disagreementsOf(cases)).toEqual({
      'Rejected -> Supported': 2,
      'Supported -> Rejected': 1,
      'Supported -> Unverified': 1,
    });
    expect(Object.keys(disagreementsOf(cases))).toEqual([
      'Rejected -> Supported',
      'Supported -> Rejected',
      'Supported -> Unverified',
    ]);
  });

  it('RF-1411 leaves out a case that agreed and a case with no expected label', () => {
    expect(disagreementsOf([one('Supported', 'Supported'), one(null, 'Rejected')])).toEqual({});
  });

  it('RF-1411 tells two versions with the same agreement apart by the kind of error', () => {
    const labels = ['Supported', 'Supported', 'Supported', 'Rejected', 'Rejected', 'Rejected'];
    const lenient = labels.map((expected, index) =>
      one(expected, index === 3 ? 'Supported' : expected),
    );
    const strict = labels.map((expected, index) =>
      one(expected, index === 0 ? 'Rejected' : expected),
    );

    expect(disagreementsOf(lenient)).toEqual({ 'Rejected -> Supported': 1 });
    expect(disagreementsOf(strict)).toEqual({ 'Supported -> Rejected': 1 });
  });
});
