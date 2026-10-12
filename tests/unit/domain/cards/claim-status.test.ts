import { describe, expect, it } from 'vitest';
import { countClaims, createCard, transitionClaim } from '../../../../src/domain/cards/card.js';
import { CLAIM_STATUSES, type ClaimStatus } from '../../../../src/domain/cards/card-vocabulary.js';
import { canTransitionClaim } from '../../../../src/domain/cards/claim-transitions.js';
import { draftOf } from '../../../support/card-fixtures.js';

const verdict = {
  step: 'judgement',
  reason: 'The lines do not mention it.',
  model: 'fake-model',
  at: '2026-10-12T10:00:00.000Z',
} as const;

const allowed: readonly (readonly [ClaimStatus, ClaimStatus])[] = [
  ['Proposed', 'CitationInvalid'],
  ['Proposed', 'Supported'],
  ['Proposed', 'Rejected'],
  ['Proposed', 'Unverified'],
  ['Unverified', 'Supported'],
  ['Unverified', 'Rejected'],
];

const pairs = CLAIM_STATUSES.flatMap((from) =>
  CLAIM_STATUSES.map((to): readonly [ClaimStatus, ClaimStatus] => [from, to]),
);

function twoClaimCard() {
  const base = draftOf({
    claims: [
      { text: 'one', citations: [{ path: 'a.cs', startLine: 1, endLine: 2 }] },
      { text: 'two', citations: [{ path: 'a.cs', startLine: 3, endLine: 4 }] },
    ],
  });
  const card = createCard({ ...base, id: 'FEAT-001', agentTaskId: 't' });
  if (!card.ok) throw new Error('fixture');
  return card.value;
}

describe('claim status transitions (architecture section 5)', () => {
  it.each(pairs)('RF-302 %s -> %s follows the state list', (from, to) => {
    const expected = allowed.some(([a, b]) => a === from && b === to);

    expect(canTransitionClaim(from, to)).toBe(expected);
  });

  it('RF-302 a rejected claim stays in the card with its status and reason', () => {
    const card = twoClaimCard();

    const next = transitionClaim(card, 'FEAT-001.c1', 'Rejected', verdict);

    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.value.claims).toHaveLength(2);
    expect(next.value.claims[0]).toMatchObject({ status: 'Rejected', verdict });
    expect(next.value.claims[1]?.status).toBe('Proposed');
    expect(card.claims[0]?.status).toBe('Proposed');
  });

  it('RF-302 a final status cannot change again', () => {
    const rejected = transitionClaim(twoClaimCard(), 'FEAT-001.c1', 'Rejected', verdict);
    if (!rejected.ok) throw new Error('fixture');

    expect(transitionClaim(rejected.value, 'FEAT-001.c1', 'Supported', verdict)).toEqual({
      ok: false,
      error: 'transition-not-allowed',
    });
  });

  it('RF-302 an unknown claim id is refused', () => {
    expect(transitionClaim(twoClaimCard(), 'FEAT-001.c9', 'Supported', verdict)).toEqual({
      ok: false,
      error: 'claim-not-found',
    });
  });

  it('RF-302 counts the claims per status, all five statuses present', () => {
    const rejected = transitionClaim(twoClaimCard(), 'FEAT-001.c2', 'Rejected', verdict);
    if (!rejected.ok) throw new Error('fixture');

    expect(countClaims(rejected.value)).toEqual({
      Proposed: 1,
      CitationInvalid: 0,
      Supported: 0,
      Rejected: 1,
      Unverified: 0,
    });
  });
});
