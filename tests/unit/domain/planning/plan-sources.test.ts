import { describe, expect, it } from 'vitest';
import {
  excludedClaims,
  supportedCards,
  type SourceCard,
} from '../../../../src/domain/planning/plan-sources.js';

// RF-604, ADR-005: only `Supported` claims reach the plan; every other claim is listed with its id.

const citation = { path: 'src/Orders/Checkout.cs', startLine: 1, endLine: 4 };

type Status = SourceCard['claims'][number]['status'];

function card(id: string, statuses: readonly Status[]): SourceCard {
  return {
    ...{ id, type: 'FEAT', title: `Title ${id}`, summary: 'Summary.', area: 'orders' },
    claims: statuses.map((status, index) => ({
      claimId: `${id}.c${String(index + 1)}`,
      text: `Claim ${String(index + 1)} of ${id}.`,
      citations: [citation],
      status,
    })),
  };
}

const cards = [
  card('FEAT-001', ['Supported', 'Rejected']),
  card('FEAT-002', ['Unverified', 'CitationInvalid', 'Proposed']),
  card('FEAT-003', ['Supported']),
];

describe('supportedCards', () => {
  it('RF-604 keeps only the Supported claims, in card order', () => {
    const kept = supportedCards(cards);

    expect(kept.map((each) => each.id)).toEqual(['FEAT-001', 'FEAT-003']);
    expect(kept[0]?.claims.map((claim) => claim.claimId)).toEqual(['FEAT-001.c1']);
  });

  it('RF-604 leaves out a card without a Supported claim', () => {
    expect(supportedCards([card('FEAT-002', ['Rejected'])])).toEqual([]);
  });
});

describe('excludedClaims', () => {
  it('RF-604 lists every rejected, invalid and unverified claim with its id and card', () => {
    expect(excludedClaims(cards)).toEqual([
      { claimId: 'FEAT-001.c2', cardId: 'FEAT-001', status: 'Rejected' },
      { claimId: 'FEAT-002.c1', cardId: 'FEAT-002', status: 'Unverified' },
      { claimId: 'FEAT-002.c2', cardId: 'FEAT-002', status: 'CitationInvalid' },
      { claimId: 'FEAT-002.c3', cardId: 'FEAT-002', status: 'Proposed' },
    ]);
  });
});
