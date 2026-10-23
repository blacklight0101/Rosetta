import { describe, expect, it } from 'vitest';
import { parseCardOutput } from '../../../../src/application/cards/parse-cards.js';
import { cardObject, cardsJson, problemPaths } from '../../../support/card-output.js';
import {
  flowObject,
  screenJsonDetail,
  screenObject,
} from '../../../support/flow-screen-fixtures.js';

// P5-14, RF-208, DEC-18: the slips of a reader answer that are repaired locally. Each rule has
// its own test, so removing a rule fails one. Required evidence is never filled in.

const json = (card: Record<string, unknown>): string => JSON.stringify({ cards: [card] });
const screenWith = (change: Record<string, unknown>): string =>
  json(screenObject({ screen: { ...screenJsonDetail, ...change } }));

describe('P5-14 a null detail the card type does not need is left out', () => {
  it.each([
    ['flow', 'FEAT'],
    ['screen', 'FEAT'],
    ['question', 'FEAT'],
    ['whyItMatters', 'BR'],
    ['screen', 'FLOW'],
  ])('RF-208 %s: null on a %s card reads as absent', (field, type) => {
    const base = type === 'FLOW' ? flowObject() : cardObject({ type });
    const parsed = parseCardOutput(json({ ...base, [field]: null }));

    expect(parsed.ok).toBe(true);
  });

  it('DEC-18 a null detail the type needs stays invalid', () => {
    const paths = problemPaths(json(screenObject({ screen: null })));

    expect(paths).toEqual(['cards.0.screen']);
  });

  it('DEC-18 an OQ with a null question stays invalid', () => {
    const card = cardObject({ type: 'OQ', question: null, whyItMatters: 'It changes totals.' });

    expect(problemPaths(json(card))).toContain('cards.0.question');
  });
});

describe('P5-14 a null list the schema lets be empty is empty', () => {
  it.each(['roles', 'fields', 'actions', 'leadsTo'])('RF-261 screen.%s null is []', (key) => {
    const parsed = parseCardOutput(screenWith({ [key]: null }));

    expect(parsed.ok && parsed.value[0]?.screen?.[key as 'roles']).toEqual([]);
  });

  it('RF-261 a field with null validations has none', () => {
    const field = { name: 'Email', inputKind: 'text', required: true, validations: null };
    const parsed = parseCardOutput(
      json(
        screenObject({
          screen: { ...screenJsonDetail, fields: [field] },
          claims: [{ text: 'It shows a form.', citations: ['src/Web/Checkout.aspx:1-5'] }],
        }),
      ),
    );

    expect(parsed.ok && parsed.value[0]?.screen?.fields[0]?.validations).toEqual([]);
  });

  it('RF-260 a step with a null target or null branches keeps the step', () => {
    const claims = [
      {
        text: 'It saves.',
        target: null,
        branches: null,
        citations: ['src/Orders/Checkout.cs:1-5'],
      },
    ];
    const parsed = parseCardOutput(json({ ...flowObject(), claims }));

    expect(parsed.ok).toBe(true);
  });
});

describe('P5-14 the screen detail written on the card moves into screen', () => {
  const { route, roles, fields, actions, leadsTo } = screenJsonDetail;

  it('RF-261 route, roles, fields, actions and links on the card are read as the screen', () => {
    const flat = screenObject({ screen: undefined, route, roles, fields, actions, leadsTo });
    const parsed = parseCardOutput(json(flat));

    expect(parsed.ok && parsed.value[0]?.screen?.route).toBe('/Checkout.aspx');
    expect(parsed.ok && parsed.value[0]?.screen?.actions).toHaveLength(2);
  });

  it('DEC-18 no screen and no route anywhere is still invalid; no route is made up', () => {
    const paths = problemPaths(json(screenObject({ screen: undefined, roles })));

    expect(paths).toEqual(['cards.0.screen']);
  });

  it('RF-261 a null route is not filled in', () => {
    expect(problemPaths(screenWith({ route: null }))).toContain('cards.0.screen.route');
  });
});

describe('P5-14 evidence is never filled in (DEC-18)', () => {
  it('a claim with null citations stays invalid', () => {
    const card = cardObject({ claims: [{ text: 'It creates an order.', citations: null }] });

    expect(problemPaths(json(card)).length).toBeGreaterThan(0);
  });

  it('a card with null claims stays invalid', () => {
    expect(problemPaths(cardsJson({ claims: null })).length).toBeGreaterThan(0);
  });
});
