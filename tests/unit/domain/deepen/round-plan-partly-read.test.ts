import { describe, expect, it } from 'vitest';
import { planRound, type RoundInput } from '../../../../src/domain/deepen/round-plan.js';
import { coverageOf, deepenFiles } from '../../../support/deepen-fixtures.js';

// RF-209, EV-04: the coverage pass offers the unread ranges of files that were read in part.

function input(coverage: RoundInput['coverage'], coveragePass = true): RoundInput {
  return {
    cards: [],
    coverage,
    files: deepenFiles,
    reread: new Set(),
    writtenHere: new Set(),
    retriedAreas: new Set(),
    coveragePass,
  };
}

const partly = coverageOf('src', [
  { path: 'src/a.cs', read: 100 },
  { path: 'src/b.cs', read: 20 },
  { path: 'src/c.cs', read: 50 },
]);

describe('planRound partly read files', () => {
  it('RF-209 offers the unread lines of a partly read file, with the tokens they hold', () => {
    const plan = planRound(input([partly]));

    expect(plan.gaps).toEqual([
      {
        path: 'src/b.cs',
        area: 'src',
        tokens: 280,
        unreadRanges: [{ startLine: 21, endLine: 300 }],
      },
    ]);
  });

  it('RF-209 puts a partly read and an unread file in one list, largest unread first', () => {
    const mixed = coverageOf('src', [
      { path: 'src/a.cs', read: 0 },
      { path: 'src/b.cs', read: 280 },
      { path: 'src/c.cs', read: 50 },
    ]);

    const plan = planRound(input([mixed]));

    expect(plan.gaps.map((gap) => [gap.path, gap.tokens])).toEqual([
      ['src/a.cs', 100],
      ['src/b.cs', 20],
    ]);
    expect(plan.gaps[0]?.unreadRanges).toBeUndefined();
  });

  it('RF-209 offers nothing of a partly read file when the coverage pass is unticked', () => {
    expect(planRound(input([partly], false)).gaps).toEqual([]);
  });

  it('RF-209 counts lines another task read: the unread ranges are those no entry read', () => {
    const later = {
      ...coverageOf('src', []),
      files: [{ path: 'src/b.cs', read: [{ startLine: 100, endLine: 300 }] }],
    };

    const plan = planRound(input([partly, later]));

    expect(plan.gaps[0]?.unreadRanges).toEqual([{ startLine: 21, endLine: 99 }]);
    expect(plan.gaps[0]?.tokens).toBe(79);
  });
});
