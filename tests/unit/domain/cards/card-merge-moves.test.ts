import { describe, expect, it } from 'vitest';
import { applyMerges } from '../../../../src/domain/cards/card-merge.js';
import { cardsAcrossAreas, threeEntities } from '../../../support/merge-fixtures.js';

// RF-250, RF-1004: a merge renumbers the claims of the cards it absorbs, so it records where each
// claim went; the run events and the pages follow the claims by that record.

describe('applyMerges: the claim moves', () => {
  it('RF-250 a merge records the new id of every claim that was renumbered', () => {
    const result = applyMerges(cardsAcrossAreas(), [
      { ids: ['ENT-001', 'ENT-002'], title: 'Customer', summary: 'One.' },
    ]);

    expect(result.moves).toEqual([
      {
        cardId: 'ENT-001',
        from: ['ENT-001', 'ENT-002'],
        claims: [
          { from: 'ENT-002.c1', to: 'ENT-001.c2' },
          { from: 'ENT-002.c2', to: 'ENT-001.c3' },
        ],
      },
    ]);
  });

  it('RF-250 a merge of three cards records the claims of both absorbed cards', () => {
    const result = applyMerges(threeEntities('Shipping'), [
      { ids: ['ENT-001', 'ENT-002', 'ENT-003'], title: 'Customer', summary: 'One.' },
    ]);

    expect(result.moves[0]?.claims).toEqual([
      { from: 'ENT-002.c1', to: 'ENT-001.c2' },
      { from: 'ENT-003.c1', to: 'ENT-001.c3' },
    ]);
  });
});

describe('applyMerges: the claim moves of several merges', () => {
  it('RF-250 two merges in a row each record their own moves', () => {
    const result = applyMerges(threeEntities('Shipping'), [
      { ids: ['ENT-002', 'ENT-003'], title: 'Client', summary: 'One.' },
      { ids: ['ENT-001', 'ENT-002'], title: 'Customer', summary: 'One.' },
    ]);

    expect(result.moves.map((move) => move.claims)).toEqual([
      [{ from: 'ENT-003.c1', to: 'ENT-002.c2' }],
      [
        { from: 'ENT-002.c1', to: 'ENT-001.c2' },
        { from: 'ENT-002.c2', to: 'ENT-001.c3' },
      ],
    ]);
  });

  it('RF-250 a merge that is skipped records no move', () => {
    const result = applyMerges(cardsAcrossAreas(), [
      { ids: ['ENT-001', 'BR-001'], title: 'x', summary: 'y' },
    ]);

    expect(result.moves).toEqual([]);
  });
});
