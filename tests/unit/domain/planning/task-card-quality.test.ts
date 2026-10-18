import { describe, expect, it } from 'vitest';
import {
  cardProblem,
  guardKinds,
  riskClasses,
  type CardQualityFields,
} from '../../../../src/domain/planning/task-card-quality.js';
import { invariant, planTask, scenario } from '../../../support/task-card-fixtures.js';

// RF-630, RF-635, DEC-135: a planned card states its invariant, its Done-when items as
// Given/When/Then scenarios and, when it adds a guard or sits at a risk, its review probes.

function card(overrides: Partial<CardQualityFields> = {}): CardQualityFields {
  return { ...planTask(), ...overrides };
}

const probe = 'A basket of exactly 50, of 49.99 and of 50.01, in any currency spelling.';

describe('cardProblem: the invariant', () => {
  it('RF-630 a card with an invariant and scenarios has no problem', () => {
    expect(cardProblem(card())).toBeUndefined();
  });

  it.each(['', ' ', '\n\t '])('RF-630 an invariant of %j is not an invariant', (blank) => {
    expect(cardProblem(card({ invariant: blank }))).toMatch(/invariant/u);
  });
});

describe('cardProblem: the Done-when scenarios', () => {
  it.each([
    'The order is stored.',
    'Given a basket of 60.',
    'Given a basket of 60, when the customer confirms.',
    'When the customer confirms a basket of 60, then it is stored.',
    'Then the order is stored, when given a basket of 60.',
    'Given nothing happens, then when it ends.',
    'Given a basket of 60, when, then the order is stored.',
    'Given a basket of 60, when the customer confirms, then',
    'Given a basket of 60, when the customer confirms, then.',
    '',
  ])('RF-630 %j is not a Given/When/Then scenario', (text) => {
    expect(cardProblem(card({ acceptanceCriteria: [scenario, text] }))).toMatch(/scenario/u);
  });

  it.each([
    'GIVEN a basket of 60, WHEN the customer confirms, THEN it is stored.',
    'Given a basket\nof 60, when the customer\nconfirms, then it is stored.',
    "Given a customer's basket, when it's confirmed, then an order is stored.",
  ])('RF-630 %j is a scenario in any letter case and layout', (text) => {
    expect(cardProblem(card({ acceptanceCriteria: [text] }))).toBeUndefined();
  });

  it('RF-630 a card with no criterion at all is not a card', () => {
    expect(cardProblem(card({ acceptanceCriteria: [] }))).toMatch(/scenario/u);
  });
});

describe('cardProblem: the review probes', () => {
  it.each(guardKinds)('RF-630 a card that adds a %s needs review probes', (kind) => {
    expect(cardProblem(card({ adds: [kind] }))).toMatch(/probes/u);
    expect(cardProblem(card({ adds: [kind], probes: [probe] }))).toBeUndefined();
  });

  it('RF-630 probes of blank text are no probes', () => {
    expect(cardProblem(card({ adds: ['limit'], probes: [' ', ''] }))).toMatch(/probes/u);
  });

  it('RF-630 a card that adds no guard and has no risk may have no probes', () => {
    expect(cardProblem(card({ adds: [], riskClass: 'none', probes: [] }))).toBeUndefined();
  });

  it.each(riskClasses.filter((each) => each !== 'none'))(
    'RF-635 a card of risk class %s is reviewed with its probes, so it needs them',
    (riskClass) => {
      expect(cardProblem(card({ riskClass }))).toMatch(/probes/u);
      expect(cardProblem(card({ riskClass, probes: [probe] }))).toBeUndefined();
    },
  );

  it('RF-630 the first problem is reported when a card has several', () => {
    expect(cardProblem(card({ invariant, acceptanceCriteria: ['x'], adds: ['filter'] }))).toMatch(
      /scenario/u,
    );
  });
});
