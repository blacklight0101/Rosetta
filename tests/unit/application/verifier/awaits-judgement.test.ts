import { describe, expect, it } from 'vitest';
import { awaitsJudgement } from '../../../../src/application/verifier/awaits-judgement.js';
import { CAP_UNVERIFIED_REASON } from '../../../../src/application/verifier/judge-claim.js';
import { leaveUnverified } from '../../../../src/application/verifier/leave-unverified.js';
import {
  createCard,
  transitionClaim,
  type Card,
  type Claim,
} from '../../../../src/domain/cards/card.js';
import type { ClaimStatus } from '../../../../src/domain/cards/card-vocabulary.js';

// RF-304, RF-301, RF-006: a resume judges the claims a cap left `Unverified` and the ones still
// `Proposed`; a claim that was judged (a verdict, or an `Unverified` that has its own reason) is
// never sent to the verifier again.

const at = '2026-10-12T10:05:00.000Z';

function proposedCard(): Card {
  const card = createCard({
    ...{ id: 'BR-001', type: 'BR', title: 'Details', summary: 'Details page.' },
    ...{ area: 'Catalog', agentTaskId: 'reader-001', confidence: 'Medium' },
    claims: [{ text: 'It loads.', citations: [{ path: 'a.cs', startLine: 1, endLine: 2 }] }],
  });
  if (!card.ok) throw new Error('The fixture card is invalid.');
  return card.value;
}

function firstClaim(card: Card): Claim {
  const [claim] = card.claims;
  if (claim === undefined) throw new Error('The fixture claim is missing.');
  return claim;
}

function claimWith(status: ClaimStatus, model: string, reason: string): Claim {
  const moved = transitionClaim(proposedCard(), 'BR-001.c1', status, {
    ...{ step: 'judgement', at, model, reason },
  });
  if (!moved.ok) throw new Error('The fixture claim cannot move.');
  return firstClaim(moved.value);
}

describe('awaitsJudgement', () => {
  it('RF-301 a claim that passed the citation check and was not judged awaits judgement', () => {
    expect(awaitsJudgement(firstClaim(proposedCard()))).toBe(true);
  });

  it('RF-304 a claim a cap left Unverified before judging awaits judgement', () => {
    const [card] = leaveUnverified([proposedCard()], at);

    expect(card && awaitsJudgement(firstClaim(card))).toBe(true);
  });

  it('RF-304 a claim the judgement step left Unverified at a cap awaits judgement', () => {
    const claim = claimWith('Unverified', 'judge-model', CAP_UNVERIFIED_REASON);

    expect(awaitsJudgement(claim)).toBe(true);
  });

  it('RF-301 a claim with a verdict is not judged again', () => {
    expect(awaitsJudgement(claimWith('Supported', 'judge-model', 'Line 1 loads.'))).toBe(false);
    expect(awaitsJudgement(claimWith('Rejected', 'judge-model', 'Line 1 does not.'))).toBe(false);
  });

  it('RF-301 a claim already Unverified for another reason is not judged again', () => {
    const failed = claimWith('Unverified', 'judge-model', 'The verifier call failed (RST-1505).');

    expect(awaitsJudgement(failed)).toBe(false);
  });
});
