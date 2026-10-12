import { describe, expect, it } from 'vitest';
import { createCard } from '../../../../src/domain/cards/card.js';
import { draftOf, oqDraft } from '../../../support/card-fixtures.js';

const ids = { id: 'FEAT-001', agentTaskId: 't' };

describe('createCard', () => {
  it('RF-202 gives every claim an id <card id>.c<n> and the status Proposed', () => {
    const card = createCard({ ...draftOf(), ...ids });

    expect(card.ok && card.value.claims).toEqual([
      {
        claimId: 'FEAT-001.c1',
        text: 'Checkout creates an order from the basket.',
        citations: [{ path: 'src/Orders/Checkout.cs', startLine: 10, endLine: 24 }],
        status: 'Proposed',
      },
    ]);
  });

  it('RF-202 a card without a claim is refused', () => {
    expect(createCard({ ...draftOf({ claims: [] }), ...ids })).toEqual({
      ok: false,
      error: 'no-claims',
    });
  });

  it('RF-202 a claim without a citation is refused', () => {
    const claims = [{ text: 'x', citations: [] }];

    expect(createCard({ ...draftOf({ claims }), ...ids })).toEqual({
      ok: false,
      error: 'claim-without-citation',
    });
  });

  it('RF-202 an OQ card needs its question and why it matters, and starts Open', () => {
    const { question, whyItMatters, ...bare } = oqDraft();

    expect(createCard({ ...bare, ...ids })).toEqual({ ok: false, error: 'question-missing' });
    const full = createCard({ ...bare, question, whyItMatters, ...ids });
    expect(full.ok && full.value.questionState).toBe('Open');
  });

  it('RF-202 a card that is not an OQ carries no question fields', () => {
    const card = createCard({ ...draftOf({ question: 'Q?', whyItMatters: 'W' }), ...ids });

    expect(card.ok && card.value.question).toBeUndefined();
  });
});
