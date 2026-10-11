import { describe, expect, it } from 'vitest';
import { codeBehindReference } from '../../../../../../src/infrastructure/scan/packs/csharp/webforms-directive.js';

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
    const text = page("<%@ page codebehind='..\\Code\\P.aspx.cs' INHERITS='A.P' %>");

    expect(codeBehindReference('Pages/P.aspx', text)).toMatchObject({
      to: 'Code/P.aspx.cs',
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

  it('RNF-001 answers quickly on hostile input without backtracking', () => {
    const hostile = `<%@ Page ${'a='.repeat(200_000)} %>`;
    const unterminated = `<%@ Page CodeBehind="${'x'.repeat(2_000_000)}`;
    const manyDirectives = '<%@ Import Namespace="N" %>\n'.repeat(100_000);
    const start = performance.now();

    expect(codeBehindReference('A.aspx', hostile)).toBeUndefined();
    expect(codeBehindReference('A.aspx', unterminated)).toBeUndefined();
    expect(codeBehindReference('A.aspx', manyDirectives)).toBeUndefined();
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
