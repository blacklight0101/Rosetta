import { describe, expect, it } from 'vitest';
import {
  isEmptyRound,
  OUT_OF_SCOPE_REASON,
  planRound,
  type RoundInput,
} from '../../../../src/domain/deepen/round-plan.js';
import {
  cardOf,
  claimOf,
  coverageOf,
  deepenFiles,
  libraryPath,
} from '../../../support/deepen-fixtures.js';

// RF-209: the round planner of a Deepen: what it judges, re-reads, leaves out of scope and reads.

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
    coveragePass: true,
    ...overrides,
  };
}

describe('planRound judgement', () => {
  it('RF-209 judges the claims left Unverified or Proposed, in card and claim order', () => {
    const cards = [
      cardOf('src', [
        claimOf('BR-001.c1', 'Supported', ['src/a.cs']),
        claimOf('BR-001.c2', 'Unverified', ['src/a.cs']),
      ]),
      cardOf('src', [
        claimOf('BR-002.c1', 'Proposed', ['src/b.cs']),
        claimOf('BR-002.c2', 'CitationInvalid', ['src/b.cs']),
      ]),
    ];

    expect(planRound(input({ cards })).judge).toEqual(['BR-001.c2', 'BR-002.c1']);
  });
});

describe('planRound re-reads', () => {
  it('RF-209 re-reads a rejected first-party claim with the verifier reason', () => {
    const rejected = claimOf('BR-001.c1', 'Rejected', ['src/a.cs']);

    const plan = planRound(input({ cards: [cardOf('orders', [rejected])] }));

    expect(plan.reread).toEqual([
      {
        claimId: 'BR-001.c1',
        area: 'orders',
        text: 'Text of BR-001.c1.',
        citations: [{ path: 'src/a.cs', startLine: 1, endLine: 2 }],
        reason: 'Reason of BR-001.c1.',
      },
    ]);
    expect(plan.outOfScope).toEqual([]);
  });

  it('RF-209 never re-reads a rejected claim citing only third-party code and lists it out of scope', () => {
    const library = claimOf('BR-001.c1', 'Rejected', [libraryPath]);

    const plan = planRound(input({ cards: [cardOf('Scripts', [library])] }));

    expect(plan.reread).toEqual([]);
    expect(plan.outOfScope).toEqual([{ claimId: 'BR-001.c1', reason: OUT_OF_SCOPE_REASON }]);
  });

  it('RF-209 re-reads a rejected claim that cites first-party code beside a library', () => {
    const mixed = claimOf('BR-001.c1', 'Rejected', [libraryPath, 'src/b.cs']);

    const plan = planRound(input({ cards: [cardOf('src', [mixed])] }));

    expect(plan.reread.map((each) => each.claimId)).toEqual(['BR-001.c1']);
    expect(plan.outOfScope).toEqual([]);
  });
});

describe('planRound one retry per fact', () => {
  it('RF-209 re-reads a rejected claim at most once per Deepen', () => {
    const rejected = claimOf('BR-001.c1', 'Rejected', ['src/a.cs']);

    const plan = planRound(
      input({ cards: [cardOf('src', [rejected])], reread: new Set(['BR-001.c1']) }),
    );

    expect(plan.reread).toEqual([]);
  });

  it('RF-209 does not re-read a replacement written in this Deepen that was rejected again', () => {
    const again = claimOf('BR-009.c1', 'Rejected', ['src/a.cs'], { replaces: 'BR-001.c1' });

    const plan = planRound(
      input({ cards: [cardOf('src', [again])], writtenHere: new Set(['BR-009.c1']) }),
    );

    expect(plan.reread).toEqual([]);
  });

  it('RF-209 may re-read a replacement an earlier Deepen wrote (Q-L: the rule is per Deepen)', () => {
    const earlier = claimOf('BR-009.c1', 'Rejected', ['src/a.cs'], { replaces: 'BR-001.c1' });

    const plan = planRound(input({ cards: [cardOf('src', [earlier])] }));

    expect(plan.reread.map((each) => each.claimId)).toEqual(['BR-009.c1']);
  });
});

describe('planRound coverage pass', () => {
  const partly = coverageOf('src', [
    { path: 'src/a.cs', read: 0 },
    { path: 'src/b.cs', read: 0 },
    { path: 'src/c.cs', read: 0 },
    { path: libraryPath, read: 0 },
  ]);

  it('RF-209 reads the first-party files no task read, largest first, never third-party code', () => {
    const plan = planRound(input({ coverage: [partly] }));

    expect(plan.gaps).toEqual([
      { path: 'src/b.cs', area: 'src', tokens: 300 },
      { path: 'src/a.cs', area: 'src', tokens: 100 },
      { path: 'src/c.cs', area: 'src', tokens: 50 },
    ]);
  });

  it('RF-209 counts a file read by any task of the run as read', () => {
    const later = coverageOf('src', [{ path: 'src/b.cs', read: 3 }]);

    const plan = planRound(input({ coverage: [partly, later] }));

    expect(plan.gaps.map((each) => each.path)).toEqual(['src/a.cs', 'src/c.cs']);
  });

  it('RF-209 reads no unread file when the owner unticked the coverage pass', () => {
    expect(planRound(input({ coverage: [partly], coveragePass: false })).gaps).toEqual([]);
  });
});

describe('isEmptyRound', () => {
  it('RF-209 finds a round with nothing to judge, re-read or read empty', () => {
    const library = claimOf('BR-001.c1', 'Rejected', [libraryPath]);
    const plan = planRound(input({ cards: [cardOf('Scripts', [library])] }));

    expect(isEmptyRound(plan)).toBe(true);
  });

  it.each([
    ['a claim to judge', { judge: ['BR-001.c1'], reread: [], outOfScope: [], gaps: [] }],
    [
      'a file to read',
      { judge: [], reread: [], outOfScope: [], gaps: [{ path: 'a', area: 'x', tokens: 1 }] },
    ],
  ])('RF-209 finds a round with %s not empty', (_name, plan) => {
    expect(isEmptyRound(plan)).toBe(false);
  });
});
