import { describe, expect, it } from 'vitest';
import type { PriorCard } from '../../../../src/application/ports/prior-cards.js';
import { compareCards } from '../../../../src/application/understand/card-changes.js';
import { createCard, type Card } from '../../../../src/domain/cards/card.js';

// RF-241: the cards of a re-run that are new, or changed, against the earlier cards of the same area.

function card(id: string, title: string, claim: string, area = 'orders'): Card {
  const made = createCard({
    ...{ id, title, area, type: 'BR', summary: 's', agentTaskId: 'reader-001' },
    confidence: 'High',
    claims: [{ text: claim, citations: [{ path: 'a.cs', startLine: 1, endLine: 2 }] }],
  });
  if (!made.ok) throw new Error(made.error);
  return made.value;
}

const prior = (title: string, claims: string[], area = 'orders'): PriorCard => ({
  ...{ id: 'BR-009', type: 'BR', title, area },
  claims,
});

describe('the changes of a re-run', () => {
  it('RF-241 calls a card with no earlier card of its area, type and title new', () => {
    const changes = compareCards([card('BR-001', 'Free shipping', 'c')], [prior('Other', ['c'])]);

    expect(changes).toEqual({ added: [{ id: 'BR-001', title: 'Free shipping' }], changed: [] });
  });

  it('RF-241 calls a card whose claims differ from the earlier card changed', () => {
    const changes = compareCards(
      [card('BR-001', 'Free shipping', 'new')],
      [prior('Free shipping', ['old'])],
    );

    expect(changes).toEqual({ added: [], changed: [{ id: 'BR-001', title: 'Free shipping' }] });
  });

  it('RF-241 lists a card with the same claims in neither list', () => {
    const changes = compareCards(
      [card('BR-001', 'Free shipping', 'c')],
      [prior('Free shipping', ['c'])],
    );

    expect(changes).toEqual({ added: [], changed: [] });
  });

  it('RF-241 matches the earlier card of the same area only', () => {
    const changes = compareCards(
      [card('BR-001', 'Free shipping', 'c', 'catalog')],
      [prior('Free shipping', ['c'], 'orders')],
    );

    expect(changes.added).toHaveLength(1);
  });
});
