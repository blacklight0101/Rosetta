import { describe, expect, it } from 'vitest';
import { codeBehindReference } from '../../../../../../src/infrastructure/scan/packs/csharp/webforms-directive.js';
import { fastestOfMs, growthOf } from '../../../../../support/stopwatch.js';

const page = (directive: string): string => `${directive}\n<html></html>\n`;

describe('WebForms code-behind link', () => {
  it('RF-111 links a page to the code-behind file and class its directive names', () => {
    const text = page(
      '<%@ Page Language="C#" CodeBehind="Default.aspx.cs" Inherits="ShopWeb.DefaultPage" %>',
    );

    expect(codeBehindReference('Default.aspx', text)).toEqual({
      from: 'Default.aspx',
      to: 'Default.aspx.cs',
      kind: 'code-behind',
      symbol: 'ShopWeb.DefaultPage',
    });
  });

  it('RF-111 handles .ascx controls and .master pages and resolves against the page folder', () => {
    expect(
      codeBehindReference(
        'Web/Controls/Banner.ascx',
        page('<%@ Control CodeBehind="Banner.ascx.cs" Inherits="Shop.Banner" %>'),
      ),
    ).toMatchObject({ to: 'Web/Controls/Banner.ascx.cs', symbol: 'Shop.Banner' });
    expect(
      codeBehindReference(
        'Site.master',
        page('<%@ Master CodeFile="Site.master.cs" Inherits="Shop.SiteMaster" %>'),
      ),
    ).toMatchObject({ to: 'Site.master.cs', symbol: 'Shop.SiteMaster' });
  });

  it('RF-111 reads attributes in any case, with single quotes and backslash paths', () => {
    const text = page("<%@ page codebehind='Code\\P.aspx.cs' INHERITS='A.P' %>");

    expect(codeBehindReference('Pages/P.aspx', text)).toMatchObject({
      to: 'Pages/Code/P.aspx.cs',
      symbol: 'A.P',
    });
  });

  it('RF-111 gives no link for a page without a code-behind attribute', () => {
    expect(codeBehindReference('Single.aspx', page('<%@ Page Language="C#" %>'))).toBeUndefined();
    expect(codeBehindReference('Plain.aspx', '<html></html>')).toBeUndefined();
  });

  it('RF-111 links the file even when the directive names no class', () => {
    const reference = codeBehindReference('A.aspx', page('<%@ Page CodeBehind="A.aspx.cs" %>'));

    expect(reference).toEqual({ from: 'A.aspx', to: 'A.aspx.cs', kind: 'code-behind' });
  });
});

describe('WebForms code-behind link (part 2)', () => {
  it('RF-111 refuses a code-behind that climbs out of the repository', () => {
    const text = page('<%@ Page CodeBehind="../../../etc/x.cs" Inherits="A.B" %>');

    expect(codeBehindReference('A.aspx', text)).toBeUndefined();
  });

  it('RF-111 ignores directives other than Page, Control and Master', () => {
    const text = page('<%@ Application CodeBehind="Global.asax.cs" Inherits="A.G" %>');

    expect(codeBehindReference('Global.asax', text)).toBeUndefined();
  });

  it('RF-111 finds the directive after an Import line and a comment', () => {
    const text =
      '<%@ Import Namespace="System" %>\n<%-- note --%>\n<%@ Page CodeBehind="A.aspx.cs" Inherits="A.A" %>\n';

    expect(codeBehindReference('A.aspx', text)).toMatchObject({ to: 'A.aspx.cs' });
  });
});

describe('WebForms code-behind link: linear time', () => {
  // The reader looks at the first 65,536 characters only, so growth is measured below that cap (8 KB and
  // 32 KB, each hostile shape filling the whole input) and the full-head case gets a generous absolute
  // bound that load cannot reach but quadratic work in 64 KB would.
  const headLength = 65_536;
  const hostileShapes: readonly (readonly [string, (length: number) => string])[] = [
    ['a long run of attributes', (length) => `<%@ Page ${'a='.repeat(length / 2)} %>`],
    ['an unterminated value', (length) => `<%@ Page CodeBehind="${'x'.repeat(length)}`],
    ['many directives', (length) => '<%@ Import Namespace="N" %>\n'.repeat(length / 25)],
  ];

  it.each(hostileShapes)(
    'RNF-001 %s is read in linear time without backtracking',
    (_name, build) => {
      const { ratio, smallMs, largeMs } = growthOf(
        (text) => codeBehindReference('A.aspx', text),
        build(8_192),
        build(32_768),
      );

      expect(
        ratio,
        `growth for 4x the input (8 KB ${smallMs.toFixed(3)} ms, 32 KB ${largeMs.toFixed(3)} ms)`,
      ).toBeLessThan(8);
    },
  );

  it.each(hostileShapes)(
    'RNF-001 %s fills the 64 KB head within a generous bound',
    (_name, build) => {
      const text = build(headLength);

      expect(codeBehindReference('A.aspx', text)).toBeUndefined();
      expect(fastestOfMs(() => codeBehindReference('A.aspx', text), 3)).toBeLessThan(3_000);
    },
  );
});

describe('WebForms code-behind link: hostile values', () => {
  const bs = String.fromCharCode(92);
  const attributes = ['CodeBehind', 'CodeFile', 'Src'];
  const values: readonly [string, string][] = [
    ['an absolute path', '/x.cs'],
    ['a drive letter', `C:${bs}x.cs`],
    ['a UNC path', `${bs}${bs}h${bs}s${bs}x.cs`],
    ['a home-relative path', '~/x.cs'],
    ['a NUL byte', 'a\u0000b.cs'],
    ['an encoded climb', '%2e%2e/x.cs'],
    ['a climb out of the folder', '../x.cs'],
    ['a climb out of a subfolder', '../../x.cs'],
    ['an empty value', ''],
  ];
  const cases = attributes.flatMap((attribute) =>
    values.map(([label, value]) => [attribute, label, value] as const),
  );

  it.each(cases)('RF-111 %s with %s (%j) gives no link', (attribute, _label, value) => {
    const text = page(`<%@ Page ${attribute}="${value}" Inherits="A.B" %>`);

    expect(codeBehindReference('Pages/A.aspx', text)).toBeUndefined();
    expect(codeBehindReference('A.aspx', text)).toBeUndefined();
  });

  it('RF-111 reads the Src attribute like CodeFile', () => {
    expect(codeBehindReference('A.aspx', page('<%@ Page Src="A.aspx.cs" %>'))).toMatchObject({
      to: 'A.aspx.cs',
    });
  });

  it('RF-111 skips a directive inside a server comment', () => {
    const text = '<%-- <%@ Page CodeBehind="evil.cs" Inherits="A.E" %> --%>\n<html></html>\n';

    expect(codeBehindReference('A.aspx', text)).toBeUndefined();
  });

  it('RF-111 still finds the real directive after a commented-out one', () => {
    const text = '<%-- <%@ Page CodeBehind="evil.cs" %> --%>\n<%@ Page CodeBehind="A.aspx.cs" %>\n';

    expect(codeBehindReference('A.aspx', text)).toMatchObject({ to: 'A.aspx.cs' });
  });

  it('RNF-001 an unterminated server comment gives no link and does not hang', () => {
    expect(codeBehindReference('A.aspx', `<%-- ${'<%@ '.repeat(50_000)}`)).toBeUndefined();
  });
});
