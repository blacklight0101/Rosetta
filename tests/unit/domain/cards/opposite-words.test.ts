import { describe, expect, it } from 'vitest';
import { hasOppositePair } from '../../../../src/domain/cards/opposite-words.js';

// RF-645, P9-13, P9-14: the pairs of opposite words are a rule of the domain.

describe('hasOppositePair', () => {
  it('RF-645 finds a pair split between the two questions, in either order', () => {
    expect(hasOppositePair(['above'], ['below'])).toBe(true);
    expect(hasOppositePair(['credit', 'note'], ['debit'])).toBe(true);
    expect(hasOppositePair(['stop'], ['start'])).toBe(true);
  });

  it('RF-645 finds no pair in the words one question has beside its own', () => {
    expect(hasOppositePair(['above', 'below'], [])).toBe(false);
    expect(hasOppositePair(['validate'], ['check'])).toBe(false);
  });
});
