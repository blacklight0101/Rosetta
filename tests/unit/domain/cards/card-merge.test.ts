import { describe, expect, it } from 'vitest';
import { applyMerges, type CardMerge } from '../../../../src/domain/cards/card-merge.js';
import { transitionClaim, type Card } from '../../../../src/domain/cards/card.js';
import { formatCitation } from '../../../../src/domain/cards/citation.js';
import {
  cardsAcrossAreas,
  threeEntities,
  twoTasksOneArea,
} from '../../../support/merge-fixtures.js';

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

    expect(applyMerges(before, [])).toEqual({ cards: before, applied: [], moves: [], skipped: [] });
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

  it('RF-250 cards of one area written by two tasks are merged like those of several areas (Q-52)', () => {
    const [first, rule, second, ...rest] = cardsAcrossAreas();
    if (!first || !rule || !second) throw new Error('fixture');

    const result = applyMerges([first, rule, { ...second, area: 'Orders' }, ...rest], [customer]);

    expect(result.skipped).toEqual([]);
    expect(result.cards[0]).toMatchObject({ id: 'ENT-001', mergedAreas: ['Orders'] });
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

describe('applyMerges: duplicates within one area (Q-52)', () => {
  it('RF-250 two ENT Invoice Table cards of one area from two tasks become one with every citation', () => {
    const before = twoTasksOneArea('ENT');

    const result = applyMerges(before, [
      { ids: ['ENT-001', 'ENT-002'], title: 'Invoice Table', summary: 'One.' },
    ]);

    expect(result.cards.map((card) => card.id)).toEqual(['ENT-001']);
    expect(citationsOf(result.cards)).toEqual(citationsOf(before));
    expect(result.cards[0]).toMatchObject({
      mergedFrom: ['ENT-001', 'ENT-002'],
      mergedAreas: ['Invoice'],
    });
  });

  it('RF-250 two FEAT cards of one area are merged', () => {
    const result = applyMerges(twoTasksOneArea('FEAT'), [
      { ids: ['FEAT-001', 'FEAT-002'], title: 'Invoice Table', summary: 'One.' },
    ]);

    expect(result.cards.map((card) => card.id)).toEqual(['FEAT-001']);
    expect(result.cards[0]?.claims).toHaveLength(2);
  });

  it('RF-250 FLOW cards stay unmerged, also within one area', () => {
    const merge = { ids: ['FLOW-001', 'FLOW-002'], title: 'Flow', summary: 'x' };
    const cards = twoTasksOneArea('ENT').map((card) => ({ ...card, type: 'FLOW' as const }));

    const result = applyMerges(
      cards.map((card, index) => ({ ...card, id: `FLOW-00${String(index + 1)}` })),
      [merge],
    );

    expect(result.skipped.map((each) => each.problem)).toEqual(['type-not-mergeable']);
  });
});

describe('applyMerges: two screens of one sheet (Q-52)', () => {
  const merged = () => {
    const before = twoTasksOneArea('SCRN');
    const result = applyMerges(before, [
      { ids: ['SCRN-001', 'SCRN-002'], title: 'Sheet1', summary: 'One screen.' },
    ]);
    return { before, result, screen: result.cards[0]?.screen };
  };

  it('RF-250 keeps every role, field, validation, action and link of both screens', () => {
    const { screen } = merged();

    expect(screen?.route).toBe('Sheet1');
    expect(screen?.roles).toEqual(['Admin', 'Clerk']);
    expect(screen?.fields.map((field) => field.name)).toEqual(['Email', 'Total']);
    expect(screen?.fields.flatMap((field) => field.validations)).toHaveLength(2);
    expect(screen?.actions.map((action) => action.label)).toEqual(['Print', 'Save']);
    expect(screen?.leadsTo).toEqual(['Sheet2', 'Sheet3']);
  });

  it('RF-250 leaves one card and loses no citation', () => {
    const { before, result } = merged();

    expect(result.cards).toHaveLength(1);
    expect(citationsOf(result.cards)).toEqual(citationsOf(before));
  });
});

function mergedFieldOf(cards: readonly Card[]) {
  const fields = cards[0]?.screen?.fields ?? [];
  return { count: fields.length, validations: fields.flatMap((field) => field.validations) };
}

describe('applyMerges: the same field on two screens (Q-52)', () => {
  it('RF-250 a field both screens have is one field with the validations and citations of both', () => {
    const [one, two] = twoTasksOneArea('SCRN');
    const field = one?.screen?.fields[0];
    if (!one || !two?.screen || !field) throw new Error('fixture');
    const email = {
      text: 'Must be an e-mail.',
      citations: [{ path: 'Invoice/Sheet1.txt', startLine: 40, endLine: 41 }],
    };
    const other = { ...field, validations: [...field.validations, email] };
    const same = { ...two, screen: { ...two.screen, fields: [other] } };

    const result = applyMerges(
      [one, same],
      [{ ids: ['SCRN-001', 'SCRN-002'], title: 'Sheet1', summary: 'One screen.' }],
    );

    const merged = mergedFieldOf(result.cards);
    expect(merged.count).toBe(1);
    expect(merged.validations.map((validation) => validation.text)).toEqual([
      `${field.name} must be filled.`,
      'Must be an e-mail.',
    ]);
    expect(merged.validations.flatMap((validation) => validation.citations)).toHaveLength(2);
  });
});
