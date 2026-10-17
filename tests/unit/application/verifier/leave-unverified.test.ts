import { describe, expect, it } from 'vitest';
import { leaveUnverified } from '../../../../src/application/verifier/leave-unverified.js';
import { transitionClaim, type Card } from '../../../../src/domain/cards/card.js';
import { assignCardIds } from '../../../../src/domain/cards/card-ids.js';
import { draftOf } from '../../../support/card-fixtures.js';

// RF-304, RF-006, DEC-13: a cap stops the run before every claim is judged; the claims not yet
// judged are left `Unverified`, never removed. A claim that already has its final status keeps it.

const at = '2026-10-12T10:05:00.000Z';

function cardsOf(): readonly Card[] {
  const assigned = assignCardIds([
    {
      agentTaskId: 'reader-001',
      area: 'orders',
      drafts: [
        draftOf({
          claims: [
            { text: 'First.', citations: [{ path: 'a.cs', startLine: 1, endLine: 2 }] },
            { text: 'Second.', citations: [{ path: 'a.cs', startLine: 3, endLine: 4 }] },
          ],
        }),
      ],
    },
  ]);
  if (!assigned.ok) throw new Error('The cards were not made');
  return assigned.value;
}

describe('leaveUnverified', () => {
  it('RF-304 turns a claim that passed the citation check and was not judged into Unverified', () => {
    const [card] = leaveUnverified(cardsOf(), at);

    expect(card?.claims.map((claim) => claim.status)).toEqual(['Unverified', 'Unverified']);
    expect(card?.claims[0]?.verdict).toMatchObject({ step: 'judgement', at });
    expect(card?.claims[0]?.verdict?.reason).toContain('cap');
  });

  it('RF-302 never removes a claim or a card', () => {
    const before = cardsOf();

    const after = leaveUnverified(before, at);

    expect(after.map((card) => card.claims.map((claim) => claim.claimId))).toEqual(
      before.map((card) => card.claims.map((claim) => claim.claimId)),
    );
  });

  it('RF-304 leaves a claim whose citation is invalid as it is: that verdict is final', () => {
    const [first] = cardsOf();
    if (first === undefined) throw new Error('No card');
    const verdict = {
      step: 'citation',
      reason: 'No such file.',
      model: 'citation-check',
      at,
    } as const;
    const moved = transitionClaim(first, 'FEAT-001.c1', 'CitationInvalid', verdict);
    if (!moved.ok) throw new Error('The claim did not move');

    const [card] = leaveUnverified([moved.value], at);

    expect(card?.claims.map((claim) => claim.status)).toEqual(['CitationInvalid', 'Unverified']);
    expect(card?.claims[0]?.verdict).toEqual(verdict);
  });

  it('RF-006 leaves a claim that is already Unverified as it was left the first time', () => {
    const once = leaveUnverified(cardsOf(), at);

    const twice = leaveUnverified(once, '2026-10-12T11:00:00.000Z');

    expect(twice).toEqual(once);
  });
});
