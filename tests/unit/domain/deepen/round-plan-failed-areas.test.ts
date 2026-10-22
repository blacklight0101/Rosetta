import { describe, expect, it } from 'vitest';
import {
  isEmptyRound,
  planRound,
  type RoundInput,
} from '../../../../src/domain/deepen/round-plan.js';
import { coverageOf, deepenFiles } from '../../../support/deepen-fixtures.js';

// RF-209, RST-1303, EV-10: a Deepen offers the areas whose task ended without a usable card. Such
// an area has no rejected claim and, once its files were opened, no unread file, so nothing else
// in the plan would ever name it.

const failure = 'failed (RST-1303)';
const opened = coverageOf('src', [
  { path: 'src/a.cs', read: 100 },
  { path: 'src/b.cs', read: 40 },
  { path: 'src/c.cs', read: 10 },
]);

function input(overrides: Partial<RoundInput> = {}): RoundInput {
  return {
    cards: [],
    coverage: [{ ...opened, failure }],
    files: deepenFiles,
    reread: new Set(),
    writtenHere: new Set(),
    retriedAreas: new Set(),
    coveragePass: true,
    ...overrides,
  };
}

describe('planRound failed areas', () => {
  it('RF-209 offers an area that failed although all its files were opened, with the files not read in full', () => {
    const plan = planRound(input());

    expect(plan.gaps).toEqual([]);
    expect(plan.failedAreas).toEqual([{ area: 'src', failure, unread: ['src/b.cs', 'src/c.cs'] }]);
    expect(isEmptyRound(plan)).toBe(false);
  });

  it('RF-209 offers failed areas whether or not the coverage pass is ticked', () => {
    expect(planRound(input({ coveragePass: false })).failedAreas.map((each) => each.area)).toEqual([
      'src',
    ]);
  });

  it('RF-209 does not offer an area that a later task read with a usable card', () => {
    const recovered = { ...coverageOf('src', [{ path: 'src/a.cs', read: 100 }]) };

    const plan = planRound(input({ coverage: [{ ...opened, failure }, recovered] }));

    expect(plan.failedAreas).toEqual([]);
  });

  it('RF-209 offers an area once per Deepen: one that was already read again is not offered again', () => {
    const plan = planRound(input({ retriedAreas: new Set(['src']) }));

    expect(plan.failedAreas).toEqual([]);
    expect(isEmptyRound(plan)).toBe(true);
  });

  it('RF-209 offers nothing when no area failed', () => {
    expect(planRound(input({ coverage: [opened] })).failedAreas).toEqual([]);
  });
});
