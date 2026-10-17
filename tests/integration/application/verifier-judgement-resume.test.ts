import { describe, expect, it } from 'vitest';
import type { LlmProvider } from '../../../src/application/ports/llm-provider.js';
import { judgeClaims } from '../../../src/application/understand/claim-judgement.js';
import { leaveUnverified } from '../../../src/application/verifier/leave-unverified.js';
import { createCard, transitionClaim, type Card } from '../../../src/domain/cards/card.js';
import type { ClaimStatus } from '../../../src/domain/cards/card-vocabulary.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { verifierHarness } from '../../support/verifier-harness.js';

// RF-304, RF-301, RF-006: the judgement step of a resumed run. The claims a cap left `Unverified`
// are judged; a claim that already has a verdict, or that was `Unverified` for its own reason, is
// not sent again; and a cap that stops the step again leaves the cap-left claims as they are.

const at = '2026-10-12T10:05:00.000Z';

const supportedAnswer = {
  retried: [],
  response: {
    text: 'Reason: Line 7 sets the label.\nVerdict: Supported',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
    finishReason: 'stop',
  },
} as const;

const citations = [{ path: 'Catalog/Details.aspx.cs', startLine: 5, endLine: 8 }];

function proposedCard(): Card {
  const card = createCard({
    ...{ id: 'BR-001', type: 'BR', title: 'Details', summary: 'Details page.' },
    ...{ area: 'Catalog', agentTaskId: 'reader-002', confidence: 'Medium' },
    claims: [1, 2, 3].map((n) => ({ text: `Claim ${String(n)}.`, citations })),
  });
  if (!card.ok) throw new Error('The fixture card is invalid.');
  return card.value;
}

/** The card as a capped run leaves it: claim 1 left by the cap, 2 Supported, 3 failed its call. */
function leftByACap(): Card {
  const [capped] = leaveUnverified([proposedCard()], at);
  if (capped === undefined) throw new Error('The fixture card is missing.');
  const judged = {
    ...capped,
    claims: capped.claims.slice(1).map((c) => ({ ...c, status: 'Proposed' as const })),
  };
  const steps: readonly (readonly [string, ClaimStatus, string])[] = [
    ['BR-001.c2', 'Supported', 'Line 7 sets it.'],
    ['BR-001.c3', 'Unverified', 'The verifier call failed (RST-1505).'],
  ];
  let card: Card = judged;
  for (const [claimId, status, reason] of steps) {
    const verdict = { step: 'judgement', at, model: 'judge-model', reason } as const;
    const moved = transitionClaim(card, claimId, status, verdict);
    if (!moved.ok) throw new Error('The fixture claim cannot move.');
    card = moved.value;
  }
  const [first] = capped.claims;
  if (first === undefined) throw new Error('The fixture claim is missing.');
  return { ...card, claims: [first, ...card.claims] };
}

describe('the judgement step of a resumed run', () => {
  it('RF-304 judges the claim a cap left Unverified, once, and leaves the judged ones alone', async () => {
    const h = await verifierHarness({ recording: recordingOf(supportedAnswer) });

    const [card] = await judgeClaims([leftByACap()], h.step());

    expect(card?.claims.map((claim) => claim.status)).toEqual([
      'Supported',
      'Supported',
      'Unverified',
    ]);
    expect(h.requests()).toHaveLength(1);
    expect(h.events.map((event) => [event.data['claimId'], event.data['status']])).toEqual([
      ['BR-001.c1', 'Supported'],
    ]);
    expect(card?.claims[2]?.verdict?.reason).toBe('The verifier call failed (RST-1505).');
  });

  it('RF-304 a cap that stops the step again keeps the claim Unverified with its first verdict', async () => {
    const capped: LlmProvider = {
      complete: () => Promise.reject(new RosettaError(ERROR_CODES.budgetCapReached)),
    };
    const h = await verifierHarness({
      recording: recordingOf(supportedAnswer),
      provider: () => capped,
    });
    const before = leftByACap();

    const [card] = await judgeClaims([before], h.step());

    expect(card).toEqual(before);
    expect(h.events).toEqual([]);
  });

  it('RF-304 a claim a user Stop left Proposed is judged on resume like any Proposed claim', async () => {
    const h = await verifierHarness({
      recording: recordingOf(supportedAnswer, supportedAnswer, supportedAnswer),
    });

    const [card] = await judgeClaims([proposedCard()], h.step());

    const statuses = card?.claims.map((claim) => claim.status);
    expect(statuses).toEqual(['Supported', 'Supported', 'Supported']);
    expect(h.requests()).toHaveLength(3);
  });
});
