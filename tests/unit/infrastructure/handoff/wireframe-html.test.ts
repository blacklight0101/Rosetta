import { describe, expect, it } from 'vitest';
import { wireframeHtml } from '../../../../src/infrastructure/handoff/handoff-wireframe-html.js';
import { htmlProblems } from '../../../support/html-check.js';
import { hostileScreen, ordersScreen } from '../../../support/ux-fixtures.js';

// RF-626, RF-507, ADR-013: a wireframe is a plain HTML file of layout boxes produced by code from
// the checked screen, never pasted from a model: no script, no event attribute, no external
// resource, every text value masked and escaped.

const keep = (text: string) => text;
const hostile =
  '</title><script>alert(1)</script><img src=x onerror=alert(1)> <a href="javascript:alert(1)">x</a> "\'&';

function orders(): string {
  return wireframeHtml(ordersScreen(), keep);
}

/** The text of the first element of this name, entities decoded the way a browser shows them. */
function textOf(html: string, tag: string): string {
  const inner = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'u').exec(html)?.[1] ?? '';
  return inner
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

describe('wireframeHtml: what a wireframe shows', () => {
  it('RF-626 is a plain HTML page that passes the HTML check', () => {
    const html = orders();

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(htmlProblems(html)).toEqual([]);
  });

  it('RF-626 states the screen name, its purpose and the legacy screens it replaces', () => {
    const html = orders();

    expect(textOf(html, 'h1')).toBe('Orders');
    expect(html).toContain('Lists orders and shows one.');
    expect(html).toContain('SCRN-001');
    expect(html).toContain('SCRN-002');
  });

  it('RF-626 lists the fields with their kind and whether they are required', () => {
    const html = orders();

    expect(html).toContain('Search (text, required)');
    expect(html).toContain('Status (dropdown, optional)');
    expect(html).toContain('Order number (text, required)');
  });

  it('RF-626 lists the actions with the handler they call or the flow they start', () => {
    const html = orders();

    expect(html).toContain('Open order (handler openOrder)');
    expect(html).toContain('Place order (starts flow FLOW-001)');
  });

  it('RF-626 lists the navigation, a link to the sibling wireframe only for a screen that has one', () => {
    const html = orders();

    expect(html).toContain('<a href="SCRN-003.html">Checkout</a>');
    const unlinked = hostileScreen('Elsewhere');
    expect(wireframeHtml(unlinked, keep)).toContain('<li class="box">Elsewhere</li>');
  });
});

describe('wireframeHtml: layout only', () => {
  it('RF-626 carries no style beyond layout boxes', () => {
    const html = orders();

    const css = /<style>([\s\S]*?)<\/style>/u.exec(html)?.[1] ?? '';
    expect(css).toMatch(/border/u);
    expect(css).not.toMatch(/color|background|font-family|url|@import/u);
  });

  it('RF-626 the same screen gives the same bytes', () => {
    expect(orders()).toBe(orders());
  });
});

describe('wireframeHtml: text from the code and the model is text', () => {
  it('RF-507 RF-626 a hostile screen name renders as text and nothing in the page runs', () => {
    const html = wireframeHtml(hostileScreen(hostile), keep);

    expect(htmlProblems(html)).toEqual([]);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript');
    expect(textOf(html, 'h1')).toBe(hostile);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('RF-507 hostile text in every other field is text too', () => {
    const html = wireframeHtml(hostileScreen(hostile), keep);

    expect(htmlProblems(html)).toEqual([]);
    expect(html.match(/&lt;script&gt;/gu)?.length).toBeGreaterThan(8);
  });

  it('RF-507 a screen name that tries to close the title and the head stays inside the title', () => {
    const html = wireframeHtml(hostileScreen('</title></head><body onload=alert(1)>'), keep);

    expect(html.match(/<title>/gu)).toHaveLength(1);
    expect(html.match(/<body/gu)).toHaveLength(1);
    expect(htmlProblems(html)).toEqual([]);
  });

  it('RF-507 a link target that is not a card id is shown as text, never as an address', () => {
    const screen = hostileScreen('Next');
    const bad = { ...screen, navigation: [{ label: 'Next', screenId: 'x" onmouseover="y' }] };

    const html = wireframeHtml(bad, keep);

    expect(html).not.toContain('onmouseover');
    expect(htmlProblems(html)).toEqual([]);
    expect(html).toContain('<li class="box">Next</li>');
  });

  it('RNF-003 a secret is masked before it is escaped', () => {
    const html = wireframeHtml(hostileScreen('Orders'), (text) =>
      text.replaceAll('Orders', 'MASKED'),
    );

    expect(html).toContain('MASKED');
    expect(html).not.toContain('Orders');
  });
});

describe('wireframeHtml: fields the verifier did not confirm', () => {
  it('RF-626 marks a field of an old card "not checked" and does not mark a confirmed one', () => {
    const screen = {
      ...ordersScreen(),
      uncheckedFields: [{ name: 'Legacy', inputKind: 'text', required: false }],
    };

    const html = wireframeHtml(screen, keep);

    expect(html).toContain('Legacy (text, optional) - not checked');
    expect(html).toContain('Search (text, required)</li>');
    expect(html).not.toContain('fields not confirmed');
  });

  it('RF-626 a screen whose fields are all unsupported says "fields not confirmed", not "no field"', () => {
    const screen = { ...ordersScreen(), fields: [], fieldsNotConfirmed: true };

    const html = wireframeHtml(screen, keep);

    expect(html).toContain('fields not confirmed');
    expect(html).not.toContain('This screen has no field.');
    expect(htmlProblems(html)).toEqual([]);
  });

  it('RF-626 a screen that has no field says so', () => {
    const html = wireframeHtml({ ...ordersScreen(), fields: [] }, keep);

    expect(html).toContain('This screen has no field.');
    expect(html).not.toContain('fields not confirmed');
  });

  it('RF-507 a hostile name of a not-checked field stays escaped text', () => {
    const html = wireframeHtml(hostileScreen(hostile), keep);

    expect(htmlProblems(html)).toEqual([]);
    expect(html).not.toContain('<script>');
  });
});
