import { describe, expect, it } from 'vitest';
import { webFormsMarkup } from '../../../../../../src/infrastructure/scan/packs/csharp/webforms-markup.js';
import { growthOf } from '../../../../../support/stopwatch.js';

// P5-31, ADR-013, RNF-002: a hostile page costs the scan a bounded, linear amount of work. Each
// input is built at two sizes, n and 4n. Linear work takes about four times as long on the larger
// input and quadratic work about sixteen times, so the test checks the growth, not a wall-clock
// limit that a loaded CI runner could break. A page past the work budget gives no markup (so no
// markup claims) instead of hanging the scan.

const size = 125_000;
const repeatTo = (length: number, unit: string): string =>
  unit.repeat(Math.ceil(length / unit.length));

/** Linear work is about 4 times on 4 times the input; this allows the constant factors and the noise. */
const maxGrowth = 8;
/** A generous cap that only a hang or a runaway reader can reach. */
const hangMs = 10_000;

const hostile: readonly [string, (length: number) => string][] = [
  ['an open prefix repeated', (length) => repeatTo(length, '<asp:')],
  ['anchors that never close', (length) => repeatTo(length, '<a href="x">')],
  ['anchors with no closing bracket', (length) => repeatTo(length, '<a ')],
  ['labels with no end', (length) => repeatTo(length, '<asp:Label ')],
  ['an unclosed quote in every tag', (length) => repeatTo(length, '<asp:TextBox id="a ')],
  ['text boxes with no end', (length) => repeatTo(length, '<asp:TextBox id="a" ')],
  ['closing tags without brackets', (length) => `<a href="x">${repeatTo(length, '</a')}`],
  ['one huge word', (length) => `<${'a'.repeat(length)}`],
  ['one huge unclosed value', (length) => `<a href='${'x'.repeat(length)}`],
];

describe('the WebForms markup reader on hostile pages', () => {
  it.each(hostile)('P5-31 %s grows linearly with the page, not quadratically', (_name, build) => {
    const { largeMs, ratio } = growthOf(
      (text) => webFormsMarkup('Hostile.aspx', text),
      build(size),
      build(4 * size),
    );

    expect(ratio).toBeLessThan(maxGrowth);
    expect(largeMs).toBeLessThan(hangMs);
  });

  it('P5-31 a page past the work budget gives no markup', () => {
    expect(
      webFormsMarkup('Hostile.aspx', repeatTo(500_000, '<asp:TextBox id="a" ')),
    ).toBeUndefined();
  });

  it('P5-31 a large well-formed page is still read', () => {
    const rows = '<asp:TextBox ID="t" runat="server" />\n'.repeat(5000);

    expect(webFormsMarkup('Big.aspx', rows)?.elements.length).toBeGreaterThan(0);
  });
});
