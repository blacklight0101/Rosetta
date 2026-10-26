import { describe, expect, it } from 'vitest';
import type { CitedExcerpt } from '../../../../src/application/verifier/cited-lines.js';
import { screenRouteVerdict } from '../../../../src/application/verifier/screen-route-check.js';
import { routeFileClaimText } from '../../../../src/domain/cards/screen-claims.js';

// P5-31, P3-122: the route claim of a page whose route is its file path is decided by the code.

const excerpt = (path: string, skipped = false): CitedExcerpt[] => [
  { path, startLine: 1, endLine: 1, lines: ['<%@ Page %>'], skipped },
];

describe('the deterministic check of a route claim', () => {
  it.each([
    ['/Web/Contact.aspx', 'Web/Contact.aspx'],
    ['~/Web/Contact.aspx', 'Web/Contact.aspx'],
    ['/web/contact.ASPX', 'Web/Contact.aspx'],
  ])('P5-31 %s is Supported when the one cited file is %s', (route, path) => {
    const verdict = screenRouteVerdict({ text: routeFileClaimText(route) }, excerpt(path));

    expect(verdict?.status).toBe('Supported');
    expect(verdict?.reason).toContain(path);
  });

  it('P5-31 a route that is not the cited file path is left to the model', () => {
    expect(
      screenRouteVerdict({ text: routeFileClaimText('/orders') }, excerpt('Web/Contact.aspx')),
    ).toBeUndefined();
  });

  it('P5-31 a route claim that cites several ranges or a skipped file is left to the model', () => {
    const two = [...excerpt('Web/Contact.aspx'), ...excerpt('Web/Contact.aspx')];

    expect(
      screenRouteVerdict({ text: routeFileClaimText('/Web/Contact.aspx') }, two),
    ).toBeUndefined();
    expect(
      screenRouteVerdict(
        { text: routeFileClaimText('/Web/Contact.aspx') },
        excerpt('Web/Contact.aspx', true),
      ),
    ).toBeUndefined();
  });

  it('P5-31 any other claim is left to the model', () => {
    expect(
      screenRouteVerdict(
        { text: 'Field Name (text, optional) is on the screen.' },
        excerpt('A.aspx'),
      ),
    ).toBeUndefined();
  });
});
