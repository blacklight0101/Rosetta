import { describe, expect, it } from 'vitest';
import { parseCardsLenient } from '../../../../src/application/cards/parse-cards.js';
import { createCard } from '../../../../src/domain/cards/card.js';
import { cardsJson } from '../../../support/card-output.js';
import { loanReaderAnswer, loanScreenCard } from '../../../support/loan-reader-answer.js';

// P3-104, RF-206, RF-208, EV-07: a card without a `claims` array is read as `claims: []` and kept
// when its structured block yields cited claims.

describe('parseCardsLenient on a card without a claims array', () => {
  it('RF-208 the Loan answer keeps the SCRN card with its validation claim', () => {
    const parsed = parseCardsLenient(loanReaderAnswer);

    expect(parsed.problems).toEqual([]);
    expect(parsed.drafts.map((draft) => draft.type)).toEqual(['ENT', 'BR', 'SCRN']);
    const screen = parsed.drafts[2];
    expect(screen?.claims).toEqual([]);
    expect(screen?.screen?.fields.map((field) => field.name)).toEqual([
      'Annual Interest Rate',
      'Years',
      'Payments per Year',
      'Amount',
    ]);
  });

  it('RF-261 the kept SCRN card becomes a card whose claims come from its screen', () => {
    const parsed = parseCardsLenient(loanReaderAnswer);
    const draft = parsed.drafts[2];

    const card = draft && createCard({ ...draft, id: 'SCRN-001', agentTaskId: 't' });

    expect(card?.ok && card.value.claims.map((claim) => claim.text)).toEqual([
      'Field Payments per Year (dropdown, optional) validation: Must be one of: tenu (weekly, 52; monthly, 12; quarterly, 4; yearly, 1)',
      'The screen is at the route Sheet1.',
      'Field Annual Interest Rate (number, required) is on the screen.',
      'Field Years (number, required) is on the screen.',
      'Field Payments per Year (dropdown, optional) is on the screen.',
      'Field Amount (number, required) is on the screen.',
    ]);
    expect(card?.ok && card.value.claims.every((claim) => claim.citations.length > 0)).toBe(true);
  });
});

describe('parseCardsLenient on a card without claims and without a cited screen', () => {
  it('RF-208 a SCRN card with no claims array and no cited validation is dropped', () => {
    const bare = { ...loanScreenCard, screen: { ...loanScreenCard.screen, fields: [] } };

    const parsed = parseCardsLenient(JSON.stringify({ cards: [bare] }));

    expect(parsed.drafts).toEqual([]);
    expect(parsed.problems.map((problem) => problem.path)).toEqual(['cards.0.claims']);
  });

  it('RF-202 a card of another type without a claims array is dropped and listed', () => {
    const raw = cardsJson({ claims: undefined });

    const parsed = parseCardsLenient(raw);

    expect(parsed.drafts).toEqual([]);
    expect(parsed.problems.map((problem) => problem.path)).toEqual(['cards.0.claims']);
  });
});
