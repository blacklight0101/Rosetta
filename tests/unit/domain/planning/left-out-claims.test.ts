import { describe, expect, it } from 'vitest';
import type { CardType } from '../../../../src/domain/cards/card-vocabulary.js';
import {
  countByArea,
  countByKind,
  countByStatus,
  rankLeftOut,
} from '../../../../src/domain/planning/left-out-claims.js';
import type { ExcludedClaim } from '../../../../src/domain/planning/plan-sources.js';

// P5-26, RF-604: the claims left out are ranked by kind (BR, then FEAT, then the rest), then by the
// code they cite, so the short list in open-questions.md names the claims that matter most.

function claim(id: string, cardType: CardType, citations: number, area = 'orders'): ExcludedClaim {
  return {
    claimId: id,
    cardId: id.split('.')[0] ?? id,
    status: 'Rejected',
    cardType,
    area,
    citations,
  };
}

const mixed = [
  claim('ENT-001.c1', 'ENT', 9),
  claim('FEAT-001.c1', 'FEAT', 1),
  claim('BR-001.c1', 'BR', 1),
  claim('BR-002.c1', 'BR', 4),
  claim('FEAT-002.c1', 'FEAT', 3),
  claim('FLOW-001.c1', 'FLOW', 2),
];

describe('rankLeftOut', () => {
  it('P5-26 puts business rules first, then features, then the other kinds', () => {
    expect(rankLeftOut(mixed).map((each) => each.claimId)).toEqual([
      'BR-002.c1',
      'BR-001.c1',
      'FEAT-002.c1',
      'FEAT-001.c1',
      'ENT-001.c1',
      'FLOW-001.c1',
    ]);
  });

  it('P5-26 orders claims of one kind and one citation count by id, whatever the input order', () => {
    const tied = [claim('BR-003.c1', 'BR', 2), claim('BR-001.c1', 'BR', 2)];
    expect(rankLeftOut(tied).map((each) => each.claimId)).toEqual(['BR-001.c1', 'BR-003.c1']);
    expect(rankLeftOut([...tied].reverse()).map((each) => each.claimId)).toEqual([
      'BR-001.c1',
      'BR-003.c1',
    ]);
  });

  it('P5-26 does not change the list it is given', () => {
    const before = mixed.map((each) => each.claimId);
    rankLeftOut(mixed);
    expect(mixed.map((each) => each.claimId)).toEqual(before);
  });
});

describe('left-out counts', () => {
  it('P5-26 counts per card kind in the order of importance and omits kinds with none', () => {
    expect(countByKind(mixed)).toEqual([
      { name: 'BR', count: 2 },
      { name: 'FEAT', count: 2 },
      { name: 'ENT', count: 1 },
      { name: 'FLOW', count: 1 },
    ]);
  });

  it('P5-26 counts per area, the largest first', () => {
    const claims = [claim('BR-001.c1', 'BR', 1, 'b'), claim('BR-002.c1', 'BR', 1, 'a')];
    expect(countByArea([...claims, claim('BR-003.c1', 'BR', 1, 'b')])).toEqual([
      { name: 'b', count: 2 },
      { name: 'a', count: 1 },
    ]);
  });

  it('P5-26 counts per status', () => {
    const claims = [
      claim('BR-001.c1', 'BR', 1),
      { ...claim('BR-001.c2', 'BR', 1), status: 'Unverified' as const },
    ];
    expect(countByStatus(claims)).toEqual([
      { name: 'Rejected', count: 1 },
      { name: 'Unverified', count: 1 },
    ]);
  });
});
