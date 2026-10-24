import { describe, expect, it } from 'vitest';
import { webFormsMarkup } from '../../../../../../src/infrastructure/scan/packs/csharp/webforms-markup.js';

// P5-31, ADR-013, RNF-002: a hostile page costs the scan a bounded, linear amount of work. Each
// input is 500 KB of the shape that made an unbounded reader quadratic; none may take long, and a
// page past the work budget gives no markup (so no markup claims) instead of hanging the scan.

const size = 500_000;
const repeat = (unit: string): string => unit.repeat(Math.ceil(size / unit.length));

const hostile: readonly [string, string][] = [
  ['an open prefix repeated', repeat('<asp:')],
  ['anchors that never close', repeat('<a href="x">')],
  ['anchors with no closing bracket', repeat('<a ')],
  ['labels with no end', repeat('<asp:Label ')],
  ['an unclosed quote in every tag', repeat('<asp:TextBox id="a ')],
  ['text boxes with no end', repeat('<asp:TextBox id="a" ')],
  ['closing tags without brackets', `<a href="x">${repeat('</a')}`],
  ['one huge word', `<${'a'.repeat(size)}`],
  ['one huge unclosed value', `<a href='${'x'.repeat(size)}`],
];

describe('the WebForms markup reader on hostile pages', () => {
  it.each(hostile)('P5-31 %s is read in well under a second', (_name, text) => {
    const started = performance.now();

    webFormsMarkup('Hostile.aspx', text);

    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('P5-31 a page past the work budget gives no markup', () => {
    expect(webFormsMarkup('Hostile.aspx', repeat('<asp:TextBox id="a" '))).toBeUndefined();
  });

  it('P5-31 a large well-formed page is still read', () => {
    const rows = '<asp:TextBox ID="t" runat="server" />\n'.repeat(5000);

    expect(webFormsMarkup('Big.aspx', rows)?.elements.length).toBeGreaterThan(0);
  });
});
