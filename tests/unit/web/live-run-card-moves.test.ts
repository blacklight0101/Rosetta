import { describe, expect, it } from 'vitest';
import { cardProposed, ev, stateAfter } from './live-run-fixtures.js';

// RF-250, RF-1002: when cards merge, the card list of the run page shows the merged card once and
// no card that was merged away, whether the events arrive live, in a replay or twice.

const merge = (seq: number, cardId: string, from: readonly string[]) =>
  ev(seq, 'cards.merged', { cardId, from, claims: [] });

const idsOf = (state: ReturnType<typeof stateAfter>) => state.cards.map((card) => card.cardId);

describe('the run page and the cards a merge absorbs', () => {
  it('RF-250 the merged card is listed once and the cards it absorbed are not', () => {
    const state = stateAfter(
      cardProposed(1, 'reader-001', 'ENT-001'),
      cardProposed(2, 'reader-002', 'ENT-002'),
      cardProposed(3, 'reader-002', 'BR-001'),
      merge(4, 'ENT-001', ['ENT-001', 'ENT-002']),
    );

    expect(idsOf(state)).toEqual(['ENT-001', 'BR-001']);
  });

  it('RF-250 two merges leave one card for each pair', () => {
    const state = stateAfter(
      cardProposed(1, 'reader-001', 'ENT-001'),
      cardProposed(2, 'reader-002', 'ENT-002'),
      cardProposed(3, 'reader-001', 'BR-001'),
      cardProposed(4, 'reader-002', 'BR-002'),
      merge(5, 'ENT-001', ['ENT-001', 'ENT-002']),
      merge(6, 'BR-001', ['BR-001', 'BR-002']),
    );

    expect(idsOf(state)).toEqual(['ENT-001', 'BR-001']);
  });

  it('RF-1002 a merge event replayed changes nothing the second time', () => {
    const events = [
      cardProposed(1, 'reader-001', 'ENT-001'),
      cardProposed(2, 'reader-002', 'ENT-002'),
      merge(3, 'ENT-001', ['ENT-001', 'ENT-002']),
    ];

    expect(idsOf(stateAfter(...events, ...events))).toEqual(['ENT-001']);
  });

  it('RF-250 a merge event with damaged data changes no card', () => {
    const state = stateAfter(
      cardProposed(1, 'reader-001', 'ENT-001'),
      cardProposed(2, 'reader-002', 'ENT-002'),
      ev(3, 'cards.merged', { cardId: 'ENT-001', from: 'no', claims: [] }),
    );

    expect(idsOf(state)).toEqual(['ENT-001', 'ENT-002']);
  });
});
