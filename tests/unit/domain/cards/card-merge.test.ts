import { describe, expect, it } from 'vitest';
import { applyMerges, type CardMerge } from '../../../../src/domain/cards/card-merge.js';
import { transitionClaim, type Card } from '../../../../src/domain/cards/card.js';
import { formatCitation } from '../../../../src/domain/cards/citation.js';
import { cardsAcrossAreas, threeEntities } from '../../../support/merge-fixtures.js';

// RF-250, ADR-005: duplicate cards of several areas become one card that keeps every claim and
// every citation, and the merge is recorded in `mergedFrom`.

const customer: CardMerge = { ids: ['ENT-001', 'ENT-002'], title: 'Customer', summary: 'One.' };

function citationsOf(cards: readonly Card[]): string[] {
  return cards
    .flatMap((card) => card.claims.flatMap((claim) => claim.citations))
    .map(formatCitation)
    .sort();
}

const entities = (cards: readonly Card[]) => cards.filter((card) => card.type === 'ENT');

describe('applyMerges: the merged card', () => {
  it('RF-250 two cards of two areas become one card with the lowest id', () => {
    const result = applyMerges(cardsAcrossAreas(), [customer]);

    expect(result.cards.map((card) => card.id)).toEqual(['ENT-001', 'BR-001', 'OQ-001']);
    expect(result.applied).toEqual([customer]);
  });

  it('RF-250 no citation is lost in a merge', () => {
    const before = cardsAcrossAreas();

    const result = applyMerges(before, [customer]);

    expect(citationsOf(entities(result.cards))).toEqual(citationsOf(entities(before)));
    expect(citationsOf(entities(result.cards))).toHaveLength(4);
  });

  it('RF-250 every claim stays, numbered again under the merged id', () => {
    const result = applyMerges(cardsAcrossAreas(), [customer]);

    const merged = result.cards[0];
    expect(merged?.claims.map((claim) => claim.claimId)).toEqual([
      'ENT-001.c1',
      'ENT-001.c2',
      'ENT-001.c3',
    ]);
    expect(merged?.claims.map((claim) => claim.text)).toEqual([
      'A customer has an id and a name.',
      'The client table holds the billing name.',
      'A client has an id.',
    ]);
  });

  it('RF-250 the merge is recorded in mergedFrom and the card takes the model title and summary', () => {
    const result = applyMerges(cardsAcrossAreas(), [
      { ...customer, title: 'Customer record', summary: 'Merged.' },
    ]);

    expect(result.cards[0]).toMatchObject({
      mergedFrom: ['ENT-001', 'ENT-002'],
      title: 'Customer record',
      summary: 'Merged.',
      area: 'Orders',
      agentTaskId: 'reader-001',
    });
  });
});

describe('applyMerges: what a merge keeps', () => {
  it('RF-250 a rejected claim keeps its status and verdict in the merged card', () => {
    const [first, rule, second, ...rest] = cardsAcrossAreas();
    const verdict = {
      step: 'citation' as const,
      reason: 'No such file.',
      model: 'citation-check',
      at: 'T',
    };
    const marked = second && transitionClaim(second, 'ENT-002.c1', 'CitationInvalid', verdict);
    if (!marked?.ok || !first || !rule) throw new Error('fixture');

    const result = applyMerges([first, rule, marked.value, ...rest], [customer]);

    expect(result.cards[0]?.claims[1]).toMatchObject({ status: 'CitationInvalid', verdict });
  });

  it('RF-250 the lowest confidence of the merged cards is kept', () => {
    const result = applyMerges(cardsAcrossAreas(), [customer]);

    expect(result.cards[0]?.confidence).toBe('Medium');
  });

  it('RF-250 cards not named stay untouched and in order', () => {
    const before = cardsAcrossAreas();

    const result = applyMerges(before, [customer]);

    expect(result.cards.slice(1)).toEqual([before[1], before[3]]);
  });

  it('RF-250 no merge leaves every card as it was', () => {
    const before = cardsAcrossAreas();

    expect(applyMerges(before, [])).toEqual({ cards: before, applied: [], skipped: [] });
  });
});

describe('applyMerges: merges that are refused', () => {
  it.each<[string, CardMerge, string]>([
    ['one card', { ...customer, ids: ['ENT-001'] }, 'too-few-cards'],
    ['an id that is not a card', { ...customer, ids: ['ENT-001', 'ENT-009'] }, 'unknown-card'],
    ['a repeated id', { ...customer, ids: ['ENT-001', 'ENT-001'] }, 'repeated-card'],
    ['two types', { ...customer, ids: ['ENT-001', 'BR-001'] }, 'type-differs'],
  ])('RF-250 a merge of %s is skipped with its reason', (_name, merge, problem) => {
    const before = cardsAcrossAreas();

    const result = applyMerges(before, [merge]);

    expect(result.cards).toEqual(before);
    expect(result.skipped).toEqual([{ merge, problem }]);
  });

  it('RF-250 cards of one area are not merged', () => {
    const [first, rule, second, ...rest] = cardsAcrossAreas();
    if (!first || !rule || !second) throw new Error('fixture');

    const result = applyMerges([first, rule, { ...second, area: 'Orders' }, ...rest], [customer]);

    expect(result.skipped.map((each) => each.problem)).toEqual(['one-area']);
  });

  it('RF-250 an open question is never merged', () => {
    const cards = cardsAcrossAreas();
    const question = cards[3];
    if (!question) throw new Error('fixture');
    const twin = { ...question, id: 'OQ-002', area: 'Orders' };
    const merge = { ...customer, ids: ['OQ-001', 'OQ-002'] };

    const result = applyMerges([...cards, twin], [merge]);

    expect(result.skipped.map((each) => each.problem)).toEqual(['type-not-mergeable']);
  });

  it('RF-250 a card named by an earlier merge cannot be merged again', () => {
    const again: CardMerge = { ...customer, ids: ['ENT-002', 'ENT-001'] };

    const result = applyMerges(cardsAcrossAreas(), [customer, again]);

    expect(result.applied).toEqual([customer]);
    expect(result.skipped.map((each) => each.problem)).toEqual(['unknown-card']);
  });
});

describe('applyMerges: a card named by a second merge', () => {
  const first: CardMerge = { ids: ['ENT-001', 'ENT-002'], title: 'Customer', summary: 'One.' };
  const second: CardMerge = { ids: ['ENT-001', 'ENT-003'], title: 'Customer', summary: 'Two.' };

  it('RF-250 a chain of merges records every merged card, none overwritten', () => {
    const result = applyMerges(threeEntities('Shipping'), [first, second]);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.mergedFrom).toEqual(['ENT-001', 'ENT-002', 'ENT-003']);
    expect(result.cards[0]?.claims.map((claim) => claim.claimId)).toEqual([
      'ENT-001.c1',
      'ENT-001.c2',
      'ENT-001.c3',
    ]);
  });

  it('RF-250 the merged card records the areas it stands for', () => {
    const result = applyMerges(threeEntities('Shipping'), [first, second]);

    expect(result.cards[0]?.mergedAreas).toEqual(['Orders', 'Billing', 'Shipping']);
  });

  it('RF-250 a card that already absorbed another area may take a card of its own area', () => {
    const result = applyMerges(threeEntities('Orders'), [first, second]);

    expect(result.skipped).toEqual([]);
    expect(result.cards[0]?.mergedFrom).toEqual(['ENT-001', 'ENT-002', 'ENT-003']);
  });
});
