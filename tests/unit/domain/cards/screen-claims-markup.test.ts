import { describe, expect, it } from 'vitest';
import { createCard } from '../../../../src/domain/cards/card.js';
import {
  leadsToClaimText,
  routeFileClaimText,
} from '../../../../src/domain/cards/screen-claims.js';
import {
  contactDraft,
  contactMarkup,
  contactPath,
  contactScreen,
} from '../../../support/page-markup-fixtures.js';

// P5-31, P3-122, RF-626, ADR-005: a claim built from page markup cites the lines of the element it
// states, nothing else, and says only what those lines show.

const ids = { id: 'SCRN-001', agentTaskId: 't' };
const cite = (startLine: number, endLine = startLine) => [
  { path: contactPath, startLine, endLine },
];

function derived(screen = contactScreen) {
  const card = createCard({ ...contactDraft(screen), ...ids });
  if (!card.ok) throw new Error('fixture');
  return card.value;
}

/** The claims after the one the agent wrote. */
function claimsOf(screen = contactScreen) {
  return derived(screen).claims.slice(1);
}

describe('P5-31 the claims of a page with markup', () => {
  it('P5-31 a link, a button, a calendar and a required field make four claims of one range each', () => {
    const claims = claimsOf().filter((claim) => !claim.text.startsWith('The screen is at'));

    expect(claims.map((claim) => [claim.text, claim.citations])).toEqual([
      ['Email support links to mailto:help@example.test.', cite(5)],
      ['Save starts btnSave_Click.', cite(9)],
      ['Field City (text, required) is on the screen.', cite(7)],
      ['Field Visit (calendar, optional) is on the screen.', cite(8)],
    ]);
  });

  it('P5-31 a link reads "<text> links to <target>" and a button "<text> starts <handler>"', () => {
    const texts = claimsOf().map((claim) => claim.text);

    expect(texts).toContain('Email support links to mailto:help@example.test.');
    expect(texts).toContain('Save starts btnSave_Click.');
    expect(texts.some((text) => text.includes('starts the handler'))).toBe(false);
  });

  it('P5-31 "required" is stated only when the markup has a validator or a required attribute', () => {
    const card = derived();

    // the agent said both fields are required; the calendar has no validator in the markup.
    expect(card.screen?.fields.map((field) => field.required)).toEqual([true, false]);
    expect(card.claims.map((claim) => claim.text)).toContain(
      'Field Visit (calendar, optional) is on the screen.',
    );
  });
});

describe('P5-31 the evidence of a field with markup', () => {
  it('P5-31 a validator of the field is cited with the field, and is the reason it is required', () => {
    const elements = contactMarkup.elements.map((element) =>
      element.names.includes('txtCity')
        ? { ...element, required: true, requiredBy: { startLine: 10, endLine: 11 } }
        : element,
    );

    const field = claimsOf({ ...contactScreen, markup: [{ ...contactMarkup, elements }] }).find(
      (claim) => claim.text.startsWith('Field City'),
    );

    expect(field?.citations).toEqual([...cite(7), ...cite(10, 11)]);
  });

  it('P5-31 a field named only by its label cites the label too', () => {
    const elements = contactMarkup.elements.map((element) =>
      element.names.includes('txtCity') ? { ...element, names: ['txt1'] } : element,
    );

    const field = claimsOf({ ...contactScreen, markup: [{ ...contactMarkup, elements }] }).find(
      (claim) => claim.text.startsWith('Field City'),
    );

    expect(field?.citations).toEqual([...cite(7), ...cite(6)]);
  });
});

describe('P5-31 the route, links and leftovers of a page with markup', () => {
  it('P5-31 the route of a page whose route is its file path cites the page directive only', () => {
    const route = claimsOf().find((claim) => claim.text === routeFileClaimText(`/${contactPath}`));

    expect(route?.citations).toEqual(cite(1));
  });

  it('P5-31 a page whose route is configured elsewhere gets no route claim from the file path', () => {
    const markup = [{ ...contactMarkup, route: 'elsewhere' as const }];

    const texts = claimsOf({ ...contactScreen, markup }).map((claim) => claim.text);

    expect(texts.some((text) => text.startsWith('The screen is at the route'))).toBe(false);
  });

  it('P5-31 a route that is not the file path gets no route claim from the file path', () => {
    const texts = claimsOf({ ...contactScreen, route: '/contact' }).map((claim) => claim.text);

    expect(texts.some((text) => text.startsWith('The screen is at the route'))).toBe(false);
  });
});

describe('P5-31 links and leftovers of a page with markup', () => {
  it('P5-31 a link the screen leads to reads like any link and cites its own lines', () => {
    const screen = { ...contactScreen, actions: [], leadsTo: ['mailto:help@example.test'] };

    const claims = claimsOf(screen);
    const claim = claims.find((each) => each.text.includes('links to'));

    expect(claim?.text).toBe('Email support links to mailto:help@example.test.');
    expect(claim?.citations).toEqual(cite(5));
    expect(claims.map((each) => each.text)).not.toContain(
      leadsToClaimText('mailto:help@example.test'),
    );
  });

  it('P5-31 an item the markup does not show keeps its claim and cites the first range of the card', () => {
    const screen = {
      ...contactScreen,
      actions: [{ label: 'Print', handler: 'Print_Click' }],
      fields: [{ name: 'Phone', inputKind: 'text', required: true, validations: [] }],
    };

    const claims = claimsOf(screen);
    const first = derived().claims[0]?.citations.slice(0, 1);

    expect(claims.find((claim) => claim.text.startsWith('Action Print'))?.citations).toEqual(first);
    expect(claims.find((claim) => claim.text.startsWith('Field Phone'))?.text).toBe(
      'Field Phone (text, required) is on the screen.',
    );
  });

  it('P5-31 the card does not keep the markup in its screen', () => {
    expect(derived().screen).not.toHaveProperty('markup');
  });

  it('P5-31 a button that starts a flow keeps its claim of before', () => {
    const screen = { ...contactScreen, actions: [{ label: 'Save', flow: 'FLOW-001' }] };

    expect(claimsOf(screen).map((claim) => claim.text)).toContain(
      'Action Save starts the flow FLOW-001.',
    );
  });
});
