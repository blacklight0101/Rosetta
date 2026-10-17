import { describe, expect, it } from 'vitest';
import {
  MERGE_BATCH_TOKENS,
  mergeBatches,
  typesToMerge,
} from '../../../../src/application/consolidate/merge-request.js';
import { cardsAcrossAreas } from '../../../support/merge-fixtures.js';
import { entities, SMALL_BOUND } from '../../../support/merge-batch-fixtures.js';

// RF-250, RF-425, P2-35: the cards of a type are sent in batches that fit the bound.

const idsOf = (batches: ReturnType<typeof mergeBatches>): string[][] =>
  batches.map((batch) => batch.map((card) => card.id));

describe('mergeBatches', () => {
  it('RF-250 P2-35 keeps the cards of a type that fits in one batch', () => {
    const cards = entities(6);

    expect(idsOf(mergeBatches(cards, 'ENT', 100_000))).toEqual([
      ['ENT-001', 'ENT-002', 'ENT-003', 'ENT-004', 'ENT-005', 'ENT-006'],
    ]);
  });

  it('RF-250 P2-35 cuts a larger type into batches, in card order, each within the bound', () => {
    expect(idsOf(mergeBatches(entities(6), 'ENT', SMALL_BOUND))).toEqual([
      ['ENT-001', 'ENT-002'],
      ['ENT-003', 'ENT-004'],
      ['ENT-005', 'ENT-006'],
    ]);
  });

  it('RF-250 P2-35 leaves out a batch of one card and the cards of other types', () => {
    expect(idsOf(mergeBatches(entities(5), 'ENT', SMALL_BOUND))).toEqual([
      ['ENT-001', 'ENT-002'],
      ['ENT-003', 'ENT-004'],
    ]);
    // The fixture has one rule and one question: nothing to compare, and OQ is never merged.
    expect(idsOf(mergeBatches(cardsAcrossAreas(), 'BR', SMALL_BOUND))).toEqual([]);
  });

  it('RF-250 P2-35 the bound of a run is a few thousand tokens', () => {
    expect(MERGE_BATCH_TOKENS).toBeGreaterThanOrEqual(2000);
    expect(MERGE_BATCH_TOKENS).toBeLessThanOrEqual(16_000);
  });
});

describe('typesToMerge, a card that already absorbed another area', () => {
  it('RF-250 P2-35 counts the areas the card stands for, not only its own', () => {
    const [customer, , client] = cardsAcrossAreas();
    if (customer === undefined || client === undefined) throw new Error('fixture');
    const areas = ['Orders', 'Billing'];
    const absorbed = { ...customer, mergedFrom: ['ENT-001', 'ENT-003'], mergedAreas: areas };
    const sameArea = { ...client, id: 'ENT-004', area: 'Orders', agentTaskId: 'reader-009' };

    expect(typesToMerge([absorbed, sameArea])).toEqual(['ENT']);
  });
});
