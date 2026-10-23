import { describe, expect, it } from 'vitest';
import { withoutLibraryDescriptions } from '../../../../src/application/understand/area-notes.js';
import type { CardDraft } from '../../../../src/domain/cards/card-ids.js';

// RF-243 (P3-123, HB-10): an area of third-party code writes no FEAT or BR card that only says it
// holds third-party code; a rule that merely mentions a library is kept.

function draft(type: CardDraft['type'], title: string, summary: string): CardDraft {
  return { type, title, summary, area: 'Scripts', confidence: 'High', claims: [] };
}

describe('cards of a third-party area', () => {
  it('RF-243 drops a FEAT or BR card whose title or summary only says the area is third-party code', () => {
    const kept = withoutLibraryDescriptions([
      draft('FEAT', 'Third-party libraries', 'Some libraries.'),
      draft('BR', 'Vendored jQuery', 'jquery-3.4.1.min.js is a minified library.'),
      draft('FEAT', 'Scripts', 'The area holds only third-party code.'),
      draft('FEAT', 'Order total', 'Adds the lines of an order.'),
    ]);

    expect(kept.map((card) => card.title)).toEqual(['Order total']);
  });

  it.each([
    ['jQuery validation requires a non-empty field', 'The form refuses an empty name.'],
    ['vendor payment terms', 'Vendors are paid in 30 days.'],
    ['Bootstrap grid breakpoints', 'The layout changes at 768 pixels.'],
    ['Library sets up a plugin namespace', 'Library sets up a plugin namespace.'],
  ])('RF-243 keeps a rule that mentions a library: %s', (title, summary) => {
    expect(withoutLibraryDescriptions([draft('BR', title, summary)])).toHaveLength(1);
  });

  it('RF-243 keeps the other card types untouched', () => {
    const kept = withoutLibraryDescriptions([
      draft('ENT', 'Third-party library', 'A library book.'),
      draft('INT', 'Third-party CDN', 'Third-party content network.'),
    ]);

    expect(kept).toHaveLength(2);
  });
});
