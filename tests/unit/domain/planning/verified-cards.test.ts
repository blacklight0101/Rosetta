import { describe, expect, it } from 'vitest';
import type { Card, Claim } from '../../../../src/domain/cards/card.js';
import type { ClaimStatus } from '../../../../src/domain/cards/card-vocabulary.js';
import { verifiedCards } from '../../../../src/domain/planning/verified-cards.js';

// RF-608, ADR-018, ADR-005: the planner recommends from the verified cards; the package uses only
// `Supported` claims.

function claim(id: string, status: ClaimStatus): Claim {
  const citations = [{ path: 'Default.aspx.cs', startLine: 1, endLine: 4 }];
  return { claimId: id, text: `Claim ${id}.`, citations, status };
}

function card(id: string, type: Card['type'], claims: readonly Claim[]): Card {
  const base = { title: `Card ${id}`, summary: 'A summary.', area: '(root)', agentTaskId: 'a-1' };
  return { ...base, id, type, confidence: 'Medium', claims };
}

describe('the verified cards', () => {
  it('RF-608 keeps only the Supported claims of a card', () => {
    const mixed = card('FEAT-001', 'FEAT', [
      claim('FEAT-001.c1', 'Supported'),
      claim('FEAT-001.c2', 'Rejected'),
      claim('FEAT-001.c3', 'Proposed'),
      claim('FEAT-001.c4', 'Unverified'),
      claim('FEAT-001.c5', 'CitationInvalid'),
    ]);

    const [kept] = verifiedCards([mixed]);

    expect(kept?.claims.map((each) => each.claimId)).toEqual(['FEAT-001.c1']);
  });

  it('RF-608 leaves out a card with no Supported claim and every open question', () => {
    const cards = [
      card('BR-001', 'BR', [claim('BR-001.c1', 'Rejected')]),
      card('OQ-001', 'OQ', [claim('OQ-001.c1', 'Supported')]),
      card('ENT-001', 'ENT', [claim('ENT-001.c1', 'Supported')]),
    ];

    expect(verifiedCards(cards).map((each) => each.id)).toEqual(['ENT-001']);
  });
});
