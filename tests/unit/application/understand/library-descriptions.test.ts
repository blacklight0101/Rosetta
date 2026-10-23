import { describe, expect, it } from 'vitest';
import { withoutLibraryDescriptions } from '../../../../src/application/understand/area-notes.js';
import type { CardDraft } from '../../../../src/domain/cards/card-ids.js';

// P3-123 (HB-10), RF-243: an area of third-party code writes no FEAT or BR card that only says it
// holds third-party code.

function draft(type: CardDraft['type'], title: string, summary: string): CardDraft {
  return { type, title, summary, area: 'Scripts', confidence: 'High', claims: [] };
}

describe('cards of a third-party area', () => {
  it('P3-123 drops a FEAT or BR card that says the area holds third-party code', () => {
    const kept = withoutLibraryDescriptions([
      draft('FEAT', 'Third-party libraries', 'The area holds only third-party code.'),
      draft('BR', 'Vendored jQuery', 'jquery-3.4.1.min.js is a minified library.'),
      draft('FEAT', 'Order total', 'Adds the lines of an order.'),
    ]);

    expect(kept.map((card) => card.title)).toEqual(['Order total']);
  });

  it('P3-123 keeps the other card types untouched', () => {
    const kept = withoutLibraryDescriptions([
      draft('ENT', 'Library', 'A library book.'),
      draft('INT', 'CDN', 'Third-party content network.'),
    ]);

    expect(kept).toHaveLength(2);
  });
});
