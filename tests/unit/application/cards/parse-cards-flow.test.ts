import { describe, expect, it } from 'vitest';
import {
  parseCardOutput,
  parseCardsLenient,
} from '../../../../src/application/cards/parse-cards.js';
import { renderRepairRequest } from '../../../../src/application/cards/repair-request.js';
import { cardsJson, problemPaths } from '../../../support/card-output.js';
import { flowJsonDetail, flowObject } from '../../../support/flow-screen-fixtures.js';

const flowJson = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({ cards: [flowObject(overrides)] });

const step = { text: 'The order is saved.', citations: ['src/Orders/Checkout.cs:30-48'] };

describe('parseCardOutput on a FLOW card', () => {
  it('RF-260 a valid FLOW fixture passes: trigger, ordered steps with targets, branches, outcome', () => {
    const parsed = parseCardOutput(flowJson());

    expect(parsed.ok && parsed.value[0]).toMatchObject({
      type: 'FLOW',
      flow: { trigger: 'The shopper presses Pay.', outcome: 'An order is stored and mailed.' },
      claims: [
        { text: 'The basket is validated.', target: 'BR-001' },
        {
          text: 'The order is saved.',
          target: 'ENT-002',
          branches: [
            {
              text: 'A stock error shows the basket again.',
              citations: [{ path: 'src/Orders/Checkout.cs', startLine: 50, endLine: 58 }],
            },
          ],
        },
      ],
    });
  });

  it('RF-260 a step may name no target card', () => {
    const parsed = parseCardOutput(flowJson({ claims: [step] }));

    expect(parsed.ok && parsed.value[0]?.claims[0]?.target).toBeUndefined();
  });

  it('RF-202 type is read in any letter case', () => {
    expect(parseCardOutput(flowJson({ type: 'flow' })).ok).toBe(true);
  });
});

describe('parseCardOutput refuses an invalid FLOW card', () => {
  it.each([
    [
      'a step without a citation',
      { claims: [{ ...step, citations: [] }] },
      'cards.0.claims.0.citations',
    ],
    [
      'a branch without a citation',
      { claims: [{ ...step, branches: [{ text: 'b', citations: [] }] }] },
      'cards.0.claims.0.branches.0.citations',
    ],
    [
      'a branch with a bad citation',
      { claims: [{ ...step, branches: [{ text: 'b', citations: ['nope'] }] }] },
      'cards.0.claims.0.branches.0.citations.0',
    ],
    ['a missing flow object', { flow: undefined }, 'cards.0.flow'],
    ['a missing trigger', { flow: { outcome: 'o' } }, 'cards.0.flow.trigger'],
    ['a missing outcome', { flow: { trigger: 't' } }, 'cards.0.flow.outcome'],
    [
      'a target that is not a card id',
      { claims: [{ ...step, target: 'the basket' }] },
      'cards.0.claims.0.target',
    ],
    [
      'a target of a type a step cannot touch',
      { claims: [{ ...step, target: 'FEAT-001' }] },
      'cards.0.claims.0.target',
    ],
    ['no step', { claims: [] }, 'cards.0.claims'],
  ])('RF-260 an invalid FLOW fixture with %s fails the schema', (_name, overrides, path) => {
    expect(problemPaths(flowJson(overrides))).toContain(path);
  });
});

describe('parseCardOutput on FLOW details', () => {
  it('RF-260 a SCRN, BR, ENT or INT card may be a step target', () => {
    for (const target of ['SCRN-004', 'BR-001', 'ENT-012', 'INT-003']) {
      expect(parseCardOutput(flowJson({ claims: [{ ...step, target }] })).ok).toBe(true);
    }
  });

  it('RF-260 a card of another type carries no flow, target or branch after parsing', () => {
    const claims = [
      { ...step, target: 'BR-001', branches: [{ text: 'b', citations: ['a.cs:1-2'] }] },
    ];

    const parsed = parseCardOutput(cardsJson({ flow: flowJsonDetail, claims }));

    expect(parsed.ok && parsed.value[0]).not.toHaveProperty('flow');
    expect(parsed.ok && parsed.value[0]?.claims[0]).not.toHaveProperty('target');
    expect(parsed.ok && parsed.value[0]?.claims[0]).not.toHaveProperty('branches');
  });

  it('RF-208 an uncited step is dropped and listed; the cited steps stay', () => {
    const claims = [
      { ...step, citations: [] },
      { ...step, text: 'Second step.' },
    ];

    const parsed = parseCardsLenient(flowJson({ claims }));

    expect(parsed.drafts[0]?.claims.map((claim) => claim.text)).toEqual(['Second step.']);
    expect(parsed.problems.map((problem) => problem.path)).toEqual(['cards.0.claims.0.citations']);
  });

  it('RF-202 the repair request names the located problem of a FLOW card', () => {
    const parsed = parseCardOutput(flowJson({ flow: { trigger: 't' } }));
    const text = renderRepairRequest('{{problems}}', parsed.ok ? [] : parsed.error);

    expect(text).toContain('- cards.0.flow.outcome:');
  });
});
