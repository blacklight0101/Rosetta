import { describe, expect, it } from 'vitest';
import {
  isEmptyRound,
  planRound,
  type RoundInput,
} from '../../../../src/domain/deepen/round-plan.js';
import { coverageOf, deepenFiles } from '../../../support/deepen-fixtures.js';

// P7-02, RF-209, DEC-194: an area of the run's plan that has no coverage entry (no reader started
// it) is a gap: the Deepen reads its first-party files whole, whether or not the coverage pass is
// ticked.

const areas = [
  { name: 'src', files: ['src/a.cs', 'src/b.cs'] },
  { name: 'later', files: ['src/c.cs', 'Scripts/jquery-3.4.1.js'] },
];

function input(overrides: Partial<RoundInput> = {}): RoundInput {
  return {
    cards: [],
    coverage: [
      coverageOf('src', [
        { path: 'src/a.cs', read: 100 },
        { path: 'src/b.cs', read: 300 },
      ]),
    ],
    files: deepenFiles,
    reread: new Set(),
    writtenHere: new Set(),
    retriedAreas: new Set(),
    coveragePass: true,
    plannedAreas: ['src', 'later'],
    areas,
    ...overrides,
  };
}

describe('planRound areas of the plan without a coverage entry', () => {
  it('P7-02 takes the first-party files of such an area as gaps, leaving the vendored one out', () => {
    const plan = planRound(input());

    expect(plan.gaps).toEqual([{ path: 'src/c.cs', area: 'later', tokens: 50 }]);
    expect(isEmptyRound(plan)).toBe(false);
  });

  it('P7-02 does so with the coverage pass off', () => {
    const plan = planRound(input({ coveragePass: false }));

    expect(plan.gaps.map((gap) => gap.path)).toEqual(['src/c.cs']);
  });

  it('P7-02 plans nothing for an area that has an entry', () => {
    const plan = planRound(input({ plannedAreas: ['src'] }));

    expect(plan.gaps).toEqual([]);
    expect(isEmptyRound(plan)).toBe(true);
  });

  it('P7-02 a run without a recorded plan behaves as before', () => {
    const { plannedAreas, ...before } = input();

    expect(plannedAreas).toBeDefined();
    expect(planRound(before).gaps).toEqual([]);
  });
});
