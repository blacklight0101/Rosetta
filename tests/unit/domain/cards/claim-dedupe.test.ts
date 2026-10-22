import { describe, expect, it } from 'vitest';
import {
  applyMerges,
  foldRepeatedClaims,
  type CardMerge,
} from '../../../../src/domain/cards/card-merge.js';
import type { Card, Claim } from '../../../../src/domain/cards/card.js';
import { createCard } from '../../../../src/domain/cards/card.js';
import { draftOf } from '../../../support/card-fixtures.js';

// P3-106, RF-230, EV-05: a claim text that is in a card twice is kept once, and the id rewrite of
// P3-80 still says where every claim went.

const one = { path: 'a.md', startLine: 1, endLine: 2 };
const two = { path: 'a.md', startLine: 5, endLine: 6 };
const merge: CardMerge = { ids: ['ENT-001', 'ENT-002'], title: 'T', summary: 'S' };

function claim(id: string, n: number, text: string, status: Claim['status'] = 'Supported'): Claim {
  return { claimId: `${id}.c${String(n)}`, text, citations: [one], status };
}

function card(id: string, claims: readonly Claim[]): Card {
  return {
    ...{ id, type: 'ENT', title: 'T', summary: 'S', area: 'a', agentTaskId: `t-${id}` },
    confidence: 'High',
    claims,
  };
}

describe('P3-106 a merge keeps an identical claim once', () => {
  const cards = [
    card('ENT-001', [claim('ENT-001', 1, 'A.'), claim('ENT-001', 2, 'B.')]),
    card('ENT-002', [claim('ENT-002', 1, 'B.'), claim('ENT-002', 2, 'C.')]),
  ];

  it('EV-05 the second copy of B. is dropped and the claims are numbered again without a gap', () => {
    const [merged] = applyMerges(cards, [merge]).cards;

    expect(merged?.claims.map((each) => [each.claimId, each.text])).toEqual([
      ['ENT-001.c1', 'A.'],
      ['ENT-001.c2', 'B.'],
      ['ENT-001.c3', 'C.'],
    ]);
  });

  it('RF-250 the id rewrite names the kept claim for the dropped copy', () => {
    const [moves] = applyMerges(cards, [merge]).moves;

    expect(moves?.claims).toEqual([
      { from: 'ENT-002.c1', to: 'ENT-001.c2' },
      { from: 'ENT-002.c2', to: 'ENT-001.c3' },
    ]);
  });
});

describe('P3-106 a merge keeps an identical claim once: evidence', () => {
  it('EV-05 a copy with other citations is kept once and its lines are not lost while it is unjudged', () => {
    const proposed = (id: string, lines: typeof one) => ({
      ...claim(id, 1, 'B.', 'Proposed'),
      citations: [lines],
    });
    const pair = [
      card('ENT-001', [proposed('ENT-001', one)]),
      card('ENT-002', [proposed('ENT-002', two)]),
    ];

    const [merged] = applyMerges(pair, [merge]).cards;

    expect(merged?.claims).toHaveLength(1);
    expect(merged?.claims[0]?.citations).toEqual([one, two]);
  });

  it('RF-302 a Rejected claim is not folded into a Supported one with the same text', () => {
    const mixed = [
      card('ENT-001', [claim('ENT-001', 1, 'B.', 'Supported')]),
      card('ENT-002', [claim('ENT-002', 1, 'B.', 'Rejected')]),
    ];

    const [merged] = applyMerges(mixed, [merge]).cards;

    expect(merged?.claims.map((each) => each.status)).toEqual(['Supported', 'Rejected']);
  });
});

describe('P3-106 a new card keeps an identical claim once', () => {
  const text = 'The basket is priced.';

  it('EV-05 a card the agent wrote with a claim twice has it once, with the lines of both', () => {
    const made = createCard({
      ...draftOf({
        claims: [
          { text, citations: [one] },
          { text: 'Other.', citations: [one] },
          { text, citations: [two] },
        ],
      }),
      id: 'FEAT-001',
      agentTaskId: 't',
    });

    expect(made.ok && made.value.claims.map((each) => each.claimId)).toEqual([
      'FEAT-001.c1',
      'FEAT-001.c2',
    ]);
    expect(made.ok && made.value.claims[0]?.citations).toEqual([one, two]);
  });

  it('RF-260 the steps of a flow are never folded: a step may repeat', () => {
    const step = { text: 'The user presses Next.', citations: [one] };
    const made = createCard({
      ...draftOf({ type: 'FLOW', claims: [step, step], flow: { trigger: 't', outcome: 'o' } }),
      id: 'FLOW-001',
      agentTaskId: 't',
    });

    expect(made.ok && made.value.claims).toHaveLength(2);
  });
});

describe('P3-106 foldRepeatedClaims', () => {
  const repeated = card('ENT-001', [
    claim('ENT-001', 1, 'A.'),
    claim('ENT-001', 2, 'A.'),
    claim('ENT-001', 3, 'B.'),
  ]);

  it('EV-05 a card that states a claim twice keeps it once and the claims run on without a gap', () => {
    const result = foldRepeatedClaims([repeated, card('ENT-002', [claim('ENT-002', 1, 'A.')])]);

    expect(result.cards[0]?.claims.map((each) => [each.claimId, each.text])).toEqual([
      ['ENT-001.c1', 'A.'],
      ['ENT-001.c2', 'B.'],
    ]);
    expect(result.cards[1]?.claims).toHaveLength(1);
  });

  it('RF-250 the move names the claim that stands for each one that changed', () => {
    const { moves } = foldRepeatedClaims([repeated]);

    expect(moves).toEqual([
      {
        cardId: 'ENT-001',
        from: ['ENT-001'],
        claims: [
          { from: 'ENT-001.c2', to: 'ENT-001.c1' },
          { from: 'ENT-001.c3', to: 'ENT-001.c2' },
        ],
      },
    ]);
  });

  it('RF-260 the steps of a flow are left alone', () => {
    const flow = { ...repeated, type: 'FLOW' as const };

    expect(foldRepeatedClaims([flow])).toEqual({ cards: [flow], moves: [] });
  });
});

describe('P3-106 steps that differ only in branches', () => {
  const branch = { number: 1, text: 'On error, stop.', citations: [one] };

  it('RF-260 two claims with one text and different branches are both kept', () => {
    const plain = claim('ENT-001', 1, 'Step.');
    const cards = [
      card('ENT-001', [plain]),
      card('ENT-002', [{ ...claim('ENT-002', 1, 'Step.'), branches: [branch] }]),
    ];

    const [merged] = applyMerges(cards, [merge]).cards;

    expect(merged?.claims.map((each) => each.branches ?? [])).toEqual([[], [branch]]);
  });
});
