import { describe, expect, it } from 'vitest';
import { parseCardOutput } from '../../../../src/application/cards/parse-cards.js';
import { cardsJson, problemPaths } from '../../../support/card-output.js';
import { screenObject } from '../../../support/flow-screen-fixtures.js';

const screenJson = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({ cards: [screenObject(overrides)] });

const baseScreen = (): Record<string, unknown> => {
  const screen = screenObject().screen;
  return typeof screen === 'object' && screen !== null ? { ...screen } : {};
};
const withScreen = (change: Record<string, unknown>): string =>
  screenJson({ screen: { ...baseScreen(), ...change } });

const cite = ['src/Web/Checkout.aspx:12-14'];

const field = { name: 'Email', inputKind: 'text', required: true };

describe('parseCardOutput on a SCRN card', () => {
  it('RF-261 a valid SCRN fixture passes: route, roles, fields, actions, links', () => {
    const parsed = parseCardOutput(screenJson());

    expect(parsed.ok && parsed.value[0]?.screen).toEqual({
      route: '/Checkout.aspx',
      roles: ['Customer'],
      fields: [
        {
          name: 'Email',
          inputKind: 'text',
          required: true,
          validations: [
            {
              text: 'Must be an e-mail address.',
              citations: [{ path: 'src/Web/Checkout.aspx', startLine: 12, endLine: 14 }],
            },
          ],
        },
      ],
      actions: [
        { label: 'Pay', handler: 'PayButton_Click' },
        { label: 'Back', flow: 'FLOW-001' },
      ],
      leadsTo: ['/Confirmation.aspx'],
    });
  });

  it('RF-261 a screen with no roles, fields, actions or links is valid', () => {
    const parsed = parseCardOutput(withScreen({ roles: [], fields: [], actions: [], leadsTo: [] }));

    expect(parsed.ok).toBe(true);
  });
});

describe('parseCardOutput refuses an invalid SCRN card', () => {
  it.each([
    ['a missing screen object', screenJson({ screen: undefined }), 'cards.0.screen'],
    ['a missing route', withScreen({ route: undefined }), 'cards.0.screen.route'],
    ['an empty route', withScreen({ route: ' ' }), 'cards.0.screen.route'],
    [
      'a field without a name',
      withScreen({ fields: [{ ...field, name: '', validations: [] }] }),
      'cards.0.screen.fields.0.name',
    ],
    [
      'a field without an input kind',
      withScreen({ fields: [{ ...field, inputKind: undefined, validations: [] }] }),
      'cards.0.screen.fields.0.inputKind',
    ],
    [
      'a required flag that is not true or false',
      withScreen({ fields: [{ ...field, required: 'maybe', validations: [] }] }),
      'cards.0.screen.fields.0.required',
    ],
    [
      'a validation without a citation',
      withScreen({ fields: [{ ...field, validations: [{ text: 'v', citations: [] }] }] }),
      'cards.0.screen.fields.0.validations.0.citations',
    ],
    [
      'an action without a label',
      withScreen({ actions: [{ handler: 'h' }] }),
      'cards.0.screen.actions.0.label',
    ],
    [
      'an action naming no handler and no flow',
      withScreen({ actions: [{ label: 'Pay' }] }),
      'cards.0.screen.actions.0',
    ],
    [
      'an action naming both a handler and a flow',
      withScreen({ actions: [{ label: 'Pay', handler: 'h', flow: 'FLOW-001' }] }),
      'cards.0.screen.actions.0',
    ],
    [
      'an action flow that is not a FLOW id',
      withScreen({ actions: [{ label: 'Pay', flow: 'BR-001' }] }),
      'cards.0.screen.actions.0.flow',
    ],
    ['roles that are not a list', withScreen({ roles: 'Customer' }), 'cards.0.screen.roles'],
  ])('RF-261 an invalid SCRN fixture with %s fails the schema', (_name, raw, path) => {
    expect(problemPaths(raw)).toContain(path);
  });
});

describe('parseCardOutput on SCRN details', () => {
  it('RF-261 a field validation with a citation passes', () => {
    const fields = [{ ...field, validations: [{ text: 'v', citations: cite }] }];

    expect(parseCardOutput(withScreen({ fields })).ok).toBe(true);
  });

  it('RF-261 a card of another type carries no screen after parsing', () => {
    const parsed = parseCardOutput(cardsJson({ screen: screenObject().screen }));

    expect(parsed.ok && parsed.value[0]).not.toHaveProperty('screen');
  });
});
