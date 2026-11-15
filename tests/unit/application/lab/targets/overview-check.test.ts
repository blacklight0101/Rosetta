import { describe, expect, it } from 'vitest';
import { checkOverview } from '../../../../../src/application/lab/targets/overview-check.js';

// RF-1412: an overview answer is labelled by what it keeps of its cards.

const cards = [
  { id: 'FEAT-1', type: 'FEAT', area: 'Catalog' },
  { id: 'SCRN-1', type: 'SCRN', area: 'Orders' },
  { id: 'ENT-1', type: 'ENT', area: 'Catalog' },
  { id: 'INT-1', type: 'INT', area: 'Services' },
  { id: 'BR-1', type: 'BR', area: 'Orders' },
];
const statement = (...ids: string[]) => ({ text: 'A statement.', cards: ids });
const none = { application: [], users: [], features: [], screens: [], data: [], integrations: [] };
const full = {
  ...none,
  application: [statement('FEAT-1', 'ENT-1')],
  features: [statement('FEAT-1', 'BR-1')],
  screens: [statement('SCRN-1')],
  data: [statement('ENT-1')],
  integrations: [statement('INT-1')],
};

describe('the labels of an overview answer', () => {
  it('RF-1412 labels an answer that reaches every area and section Written', () => {
    expect(checkOverview(cards, full)).toBe('Written');
  });

  it('RF-1412 labels an answer with no statement, or only unlisted ids or empty text, Empty', () => {
    expect(checkOverview(cards, none)).toBe('Empty');
    expect(checkOverview(cards, { ...none, application: [statement('X-1')] })).toBe('Empty');
    expect(
      checkOverview(cards, { ...none, application: [{ text: '  ', cards: ['FEAT-1'] }] }),
    ).toBe('Empty');
  });

  it('RF-1412 labels one statement that links every card Lumped', () => {
    const all = cards.map((card) => card.id);

    expect(checkOverview(cards, { ...none, application: [statement(...all)] })).toBe('Lumped');
    expect(checkOverview(cards, { ...full, application: [statement(...all)] })).toBe('Lumped');
  });

  it('RF-1412 labels an answer that leaves an area out Missed', () => {
    const noServices = { ...full, integrations: [] };

    expect(checkOverview(cards, noServices)).toBe('Missed');
  });

  it('RF-1412 labels an answer that leaves the section of a type empty Missed', () => {
    // Every area is reached, but the screen is not in `screens`.
    const misplaced = { ...full, screens: [], application: [statement('FEAT-1', 'SCRN-1')] };

    expect(checkOverview(cards, misplaced)).toBe('Missed');
    expect(checkOverview(cards, { ...full, data: [statement('FEAT-1')] })).toBe('Missed');
  });

  it('RF-1412 does not ask a section for a type the case does not hold', () => {
    const two = [cards[0], cards[4]].flatMap((card) => (card === undefined ? [] : [card]));

    expect(checkOverview(two, { ...none, features: [statement('FEAT-1', 'BR-1')] })).toBe(
      'Written',
    );
  });
});
