import { describe, expect, it } from 'vitest';
import { appendClaims, type Card } from '../../../../src/domain/cards/card.js';
import { assignCardIds, type TaskCards } from '../../../../src/domain/cards/card-ids.js';
import { extendCards } from '../../../../src/domain/cards/card-extension.js';
import { draftOf, oqDraft } from '../../../support/card-fixtures.js';

// RF-209, RF-203, DEC-158: a draft of a Deepen task that names a card the task was given (`extends`)
// is not a new card: its claims are added to that card, which keeps its id. A draft that names
// nothing listed is a new card with an id after every card of the run.

const cite = [{ path: 'src/Orders/Order.cs', startLine: 1, endLine: 9 }];

function parentCards(): readonly Card[] {
  const parent: TaskCards = {
    agentTaskId: 'reader-001',
    area: 'orders',
    drafts: [
      draftOf({
        type: 'ENT',
        title: 'Order',
        claims: [{ text: 'An order has a total.', citations: cite }],
      }),
      draftOf({ type: 'BR', title: 'Free shipping' }),
    ],
  };
  const cards = assignCardIds([parent]);
  if (!cards.ok) throw new Error(cards.error);
  return cards.value;
}

function deepenTask(drafts: TaskCards['drafts'], extendable = ['ENT-001', 'BR-001']): TaskCards {
  return { agentTaskId: 'reader-003', area: 'orders', drafts, extendable };
}

const newFact = { text: 'An order has a delivery date.', citations: cite };
const extension = (overrides = {}) =>
  draftOf({
    type: 'ENT',
    title: 'Order again',
    extends: 'ENT-001',
    claims: [newFact],
    ...overrides,
  });

describe('RF-209 a draft that extends a listed card', () => {
  it('RF-209 writes no second card for it', () => {
    const cards = assignCardIds([deepenTask([extension()])], parentCards());

    expect(cards.ok && cards.value).toEqual([]);
  });

  it('RF-203 puts the new claim on the parent card id, after its claims, as Proposed', () => {
    const extended = extendCards([deepenTask([extension()])], parentCards());

    if (!extended.ok) throw new Error(extended.error);
    const [card] = extended.value.cards;
    expect(card).toMatchObject({ id: 'ENT-001', title: 'Order', agentTaskId: 'reader-001' });
    expect(card?.claims.map((claim) => [claim.claimId, claim.status, claim.text])).toEqual([
      ['ENT-001.c1', 'Proposed', 'An order has a total.'],
      ['ENT-001.c2', 'Proposed', 'An order has a delivery date.'],
    ]);
    expect(extended.value.claims).toEqual([{ claimId: 'ENT-001.c2', agentTaskId: 'reader-003' }]);
  });

  it('RF-209 numbers the claims of two drafts of one card one after the other', () => {
    const two = [extension(), extension({ claims: [{ ...newFact, text: 'Another fact.' }] })];

    const extended = extendCards([deepenTask(two)], parentCards());

    if (!extended.ok) throw new Error(extended.error);
    expect(extended.value.cards[0]?.claims.map((claim) => claim.claimId)).toEqual([
      'ENT-001.c1',
      'ENT-001.c2',
      'ENT-001.c3',
    ]);
  });
});

describe('RF-209 the claims a draft that extends a card adds', () => {
  it('RF-209 returns only the cards that got a claim and leaves the others as they are', () => {
    const extended = extendCards([deepenTask([extension()])], parentCards());

    if (!extended.ok) throw new Error(extended.error);
    expect(extended.value.cards.map((card) => card.id)).toEqual(['ENT-001']);
  });

  it('RF-209 keeps a replaces only for a claim the task was given', () => {
    const kept = extension({ claims: [{ ...newFact, replaces: 'ENT-001.c1' }] });
    const dropped = extension({ claims: [{ ...newFact, replaces: 'BR-009.c1' }] });
    const task = (draft: TaskCards['drafts'][number]): TaskCards => ({
      ...deepenTask([draft]),
      replaceable: ['ENT-001.c1'],
    });

    const first = extendCards([task(kept)], parentCards());
    const second = extendCards([task(dropped)], parentCards());

    if (!first.ok || !second.ok) throw new Error('extension refused');
    expect(first.value.cards[0]?.claims[1]?.replaces).toBe('ENT-001.c1');
    expect(second.value.cards[0]?.claims[1]).not.toHaveProperty('replaces');
  });
});

describe('RF-203 a draft that does not extend a listed card', () => {
  const newEntity = draftOf({ type: 'ENT', title: 'Customer' });

  it('RF-209 a genuinely new entity is a new card with an id after the parent ids', () => {
    const cards = assignCardIds([deepenTask([newEntity])], parentCards());

    expect(cards.ok && cards.value.map((card) => card.id)).toEqual(['ENT-002']);
  });

  it.each([
    ['a card the task was not given', extension({ extends: 'ENT-009' })],
    ['a listed card of another type', extension({ type: 'BR', extends: 'ENT-001' })],
  ])('RF-209 writes a new card for a draft that extends %s, losing nothing', (_name, draft) => {
    const cards = assignCardIds([deepenTask([draft])], parentCards());
    const extended = extendCards([deepenTask([draft])], parentCards());

    expect(cards.ok && cards.value.map((card) => card.claims.length)).toEqual([1]);
    expect(extended.ok && extended.value.cards).toEqual([]);
  });

  it('RF-209 an open question is never extended: the question is its own card', () => {
    const open = assignCardIds([
      { agentTaskId: 'reader-001', area: 'orders', drafts: [oqDraft()] },
    ]);
    if (!open.ok) throw new Error(open.error);
    const task = deepenTask([{ ...oqDraft(), extends: 'OQ-001' }], ['OQ-001']);

    const cards = assignCardIds([task], open.value);
    const extended = extendCards([task], open.value);

    expect(cards.ok && cards.value.map((card) => card.id)).toEqual(['OQ-002']);
    expect(extended.ok && extended.value.cards).toEqual([]);
  });

  it('RF-209 writes a new card for a listed id the run does not hold', () => {
    const task = deepenTask([extension({ extends: 'ENT-007' })], ['ENT-007']);

    const cards = assignCardIds([task], parentCards());

    expect(cards.ok && cards.value.map((card) => card.id)).toEqual(['ENT-002']);
  });

  it('RF-209 a task that was given no cards never extends one', () => {
    const task: TaskCards = { agentTaskId: 'reader-003', area: 'orders', drafts: [extension()] };

    const cards = assignCardIds([task], parentCards());

    expect(cards.ok && cards.value.map((card) => card.id)).toEqual(['ENT-002']);
  });
});

describe('RF-202 a claim added to a card keeps the rules of a claim', () => {
  it('RF-202 refuses a claim without a citation and changes nothing', () => {
    const [parent] = parentCards();
    if (parent === undefined) throw new Error('no parent card');

    const added = appendClaims(parent, [{ text: 'No evidence.', citations: [] }]);

    expect(added).toEqual({ ok: false, error: 'claim-without-citation' });
  });
});
