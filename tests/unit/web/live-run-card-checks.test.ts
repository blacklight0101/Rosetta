import { expect, it } from 'vitest';
import { cardViewsOf } from '../../../web/src/lib/live-run/card-checks.js';
import { cardProposed, citationChecked, planned, stateAfter } from './live-run-fixtures.js';

// RF-1004, RF-1014, RF-1015 (P1-169): where the citations of each card stand.

const checks = (state: ReturnType<typeof stateAfter>): readonly string[] =>
  cardViewsOf(state).map((card) => `${card.cardId}:${card.check}`);

it('RF-1014 a card is checked when all its claims passed the citation check', () => {
  const state = stateAfter(
    planned(1, 'r1', 'Catalog'),
    cardProposed(2, 'r1', 'BR-001', 2),
    citationChecked(3, 'r1', 'BR-001.c1', true),
    citationChecked(4, 'r1', 'BR-001.c2', true),
  );

  expect(checks(state)).toEqual(['BR-001:checked']);
});

it('RF-1014 a card waits while one of its claims has not been checked or it has no claim yet', () => {
  const state = stateAfter(
    planned(1, 'r1', 'Catalog'),
    cardProposed(2, 'r1', 'BR-001', 2),
    citationChecked(3, 'r1', 'BR-001.c1', true),
    cardProposed(4, 'r1', 'BR-002', 0),
  );

  expect(checks(state)).toEqual(['BR-001:waiting', 'BR-002:waiting']);
});

it('RF-1004 a card with a claim whose citation is invalid says so, whatever the other claims are', () => {
  const state = stateAfter(
    planned(1, 'r1', 'Catalog'),
    cardProposed(2, 'r1', 'BR-001', 3),
    citationChecked(3, 'r1', 'BR-001.c1', true),
    citationChecked(4, 'r1', 'BR-001.c2', 'line 9 is past the end'),
  );

  expect(checks(state)).toEqual(['BR-001:invalid']);
});

it('RF-1004 a card keeps the type and the title the agent gave it', () => {
  const state = stateAfter(planned(1, 'r1', 'Catalog'), cardProposed(2, 'r1', 'BR-001', 1));

  expect(cardViewsOf(state)).toEqual([
    expect.objectContaining({ cardId: 'BR-001', type: 'BR', title: 'Title of BR-001' }),
  ]);
});
