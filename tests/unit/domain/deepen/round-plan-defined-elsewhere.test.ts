import { describe, expect, it } from 'vitest';
import { planRound, type RoundInput } from '../../../../src/domain/deepen/round-plan.js';
import { cardOf, claimOf, coverageOf, deepenFiles } from '../../../support/deepen-fixtures.js';

// P5-35, RF-209: a rejected claim whose verdict carries the reason kind "defined elsewhere" is
// planned as a re-read that carries the kind; any other rejected claim is planned as it was.

const allRead = coverageOf('src', [
  { path: 'src/a.cs', read: 100 },
  { path: 'src/b.cs', read: 300 },
  { path: 'src/c.cs', read: 50 },
]);

function input(overrides: Partial<RoundInput> = {}): RoundInput {
  return {
    cards: [],
    coverage: [allRead],
    files: deepenFiles,
    reread: new Set(),
    writtenHere: new Set(),
    retriedAreas: new Set(),
    coveragePass: false,
    ...overrides,
  };
}

function rejected(claimId: string, defined = false) {
  const claim = claimOf(claimId, 'Rejected', ['src/a.cs']);
  const { verdict } = claim;
  if (verdict === undefined || !defined) return claim;
  return { ...claim, verdict: { ...verdict, reasonKind: 'definedElsewhere' as const } };
}

describe('planRound re-read of a meaning defined elsewhere', () => {
  it('P5-35 carries the reason kind of the verdict into the re-read', () => {
    const cards = [cardOf('src', [rejected('BR-001.c1', true)])];

    expect(planRound(input({ cards })).reread).toEqual([
      {
        claimId: 'BR-001.c1',
        area: 'src',
        text: 'Text of BR-001.c1.',
        citations: [{ path: 'src/a.cs', startLine: 1, endLine: 2 }],
        reason: 'Reason of BR-001.c1.',
        reasonKind: 'definedElsewhere',
      },
    ]);
  });

  it('P5-35 a claim rejected for another reason is re-read as before, with no kind', () => {
    const cards = [cardOf('src', [rejected('BR-001.c1')])];

    const [reread] = planRound(input({ cards })).reread;

    expect(reread).toBeDefined();
    expect(reread).not.toHaveProperty('reasonKind');
  });

  it('P5-35 a Deepen with no rejected claim plans no re-read', () => {
    const cards = [cardOf('src', [claimOf('BR-001.c1', 'Supported', ['src/a.cs'])])];

    expect(planRound(input({ cards })).reread).toEqual([]);
  });

  it('P5-35 the retry is the one re-read of the Deepen: a claim sent back is not sent again', () => {
    const cards = [cardOf('src', [rejected('BR-001.c1', true)])];

    expect(planRound(input({ cards, reread: new Set(['BR-001.c1']) })).reread).toEqual([]);
  });
});
