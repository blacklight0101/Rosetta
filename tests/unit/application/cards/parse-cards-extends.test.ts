import { describe, expect, it } from 'vitest';
import { agentCardsSchema } from '../../../../src/application/cards/card-schema.js';

// RF-209, DEC-158: a card of a Deepen task may name the listed card its claims belong to. The field is
// optional: an answer without it parses as before, and a value that is not an id never costs the card.

const card = {
  type: 'ENT',
  title: 'Order',
  area: 'orders',
  summary: 'An order.',
  confidence: 'High',
  claims: [{ text: 'It has a total.', citations: ['src/Order.cs:1-9'] }],
};

function draftOf(extra: Record<string, unknown>) {
  const parsed = agentCardsSchema.safeParse({ cards: [{ ...card, ...extra }] });
  if (!parsed.success) throw new Error(parsed.error.message);
  return parsed.data.cards[0];
}

describe('RF-209 the extends field of a card', () => {
  it('RF-209 reads the id of the listed card', () => {
    expect(draftOf({ extends: 'ENT-013' })?.extends).toBe('ENT-013');
  });

  it('RF-209 leaves it out when the card does not write it', () => {
    expect(draftOf({})).not.toHaveProperty('extends');
  });

  it.each([42, '', { id: 'ENT-013' }])(
    'RF-209 drops a value (%j) that is not an id and keeps the card',
    (value) => {
      const draft = draftOf({ extends: value });

      expect(draft?.title).toBe('Order');
      expect(draft?.extends).toBeUndefined();
    },
  );
});
