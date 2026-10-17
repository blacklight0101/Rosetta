import { describe, expect, it } from 'vitest';
import { createCard, transitionClaim, type Card } from '../../../../src/domain/cards/card.js';
import type { ClaimStatus } from '../../../../src/domain/cards/card-vocabulary.js';
import {
  incompleteSteps,
  isIncompleteFlow,
} from '../../../../src/domain/cards/flow-completeness.js';
import { flowDraft, screenDraft } from '../../../support/flow-screen-fixtures.js';

// RF-260, ADR-005: a flow is incomplete when a step is CitationInvalid or Rejected, and only then;
// only FLOW cards are flows.

const verdict = {
  step: 'judgement',
  reason: 'r',
  model: 'm',
  at: '2026-10-12T10:00:00.000Z',
} as const;

/** A card whose claims have the given statuses, in order. */
function cardWith(draft: Parameters<typeof createCard>[0], statuses: readonly ClaimStatus[]): Card {
  const created = createCard(draft);
  if (!created.ok) throw new Error('fixture');
  let card = created.value;
  for (const [index, status] of statuses.entries()) {
    if (status === 'Proposed') continue;
    const moved = transitionClaim(card, `${card.id}.c${String(index + 1)}`, status, verdict);
    if (!moved.ok) throw new Error('fixture');
    card = moved.value;
  }
  return card;
}

const steps = [
  { text: 'One.', citations: [{ path: 'a.cs', startLine: 1, endLine: 2 }] },
  { text: 'Two.', citations: [{ path: 'a.cs', startLine: 3, endLine: 4 }] },
];
const flow = (statuses: readonly ClaimStatus[]) =>
  cardWith({ ...flowDraft({ claims: steps }), id: 'FLOW-001', agentTaskId: 't' }, statuses);

describe('incomplete flows', () => {
  it('RF-260 a step that is CitationInvalid or Rejected makes the flow incomplete', () => {
    expect(isIncompleteFlow(flow(['Supported', 'CitationInvalid']))).toBe(true);
    expect(isIncompleteFlow(flow(['Rejected', 'Supported']))).toBe(true);
    expect(incompleteSteps(flow(['Rejected', 'CitationInvalid'])).map((s) => s.claimId)).toEqual([
      'FLOW-001.c1',
      'FLOW-001.c2',
    ]);
  });

  it('RF-260 steps that are Unverified are not known to be wrong: the flow is not incomplete', () => {
    expect(isIncompleteFlow(flow(['Unverified', 'Unverified']))).toBe(false);
    expect(incompleteSteps(flow(['Unverified', 'Supported']))).toEqual([]);
  });

  it('RF-260 steps that are still Proposed do not make the flow incomplete', () => {
    expect(isIncompleteFlow(flow(['Proposed', 'Proposed']))).toBe(false);
    expect(isIncompleteFlow(flow(['Supported', 'Proposed']))).toBe(false);
  });

  it('RF-260 a Rejected claim of a SCRN card is not an incomplete flow', () => {
    const screen = cardWith({ ...screenDraft(), id: 'SCRN-001', agentTaskId: 't' }, [
      'Rejected',
      'CitationInvalid',
    ]);

    expect(isIncompleteFlow(screen)).toBe(false);
    expect(incompleteSteps(screen)).toEqual([]);
  });
});
