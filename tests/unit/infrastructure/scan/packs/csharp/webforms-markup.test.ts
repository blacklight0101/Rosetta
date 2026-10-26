import { describe, expect, it } from 'vitest';
import { webFormsMarkup } from '../../../../../../src/infrastructure/scan/packs/csharp/webforms-markup.js';
import {
  contactMarkup,
  contactPath,
  contactText,
} from '../../../../../support/page-markup-fixtures.js';

// P5-31, RF-626, DEC-11: the C# pack reads the elements of a WebForms page with the lines that
// show each; the universal code never parses markup.

describe('the markup of a WebForms page', () => {
  it('P5-31 returns the link, the fields and the button of the page with their own lines', () => {
    expect(webFormsMarkup(contactPath, contactText)).toEqual(contactMarkup);
  });

  it('P5-31 a field is required by a RequiredFieldValidator that names it, cited with its lines', () => {
    const text = [
      '<%@ Page Language="C#" %>',
      '<asp:TextBox ID="txtName" runat="server" />',
      '<asp:RequiredFieldValidator ID="v1" ControlToValidate="txtName"',
      '    ErrorMessage="Name is needed" runat="server" />',
    ].join('\n');

    const field = webFormsMarkup('A.aspx', text)?.elements.find((e) => e.kind === 'field');

    expect(field).toMatchObject({
      names: ['txtName'],
      required: true,
      startLine: 2,
      endLine: 2,
      requiredBy: { startLine: 3, endLine: 4 },
    });
  });

  it('P5-31 a field with no validator and no required attribute is not required', () => {
    const text =
      '<asp:TextBox ID="txtName" runat="server" />\n<asp:CompareValidator ControlToValidate="txtName" />';

    const field = webFormsMarkup('A.aspx', text)?.elements.find((e) => e.kind === 'field');

    expect(field?.required).toBe(false);
  });

  it('P5-31 a link whose text and tag span several lines cites all of them', () => {
    const text = '<a\n  href="/x.aspx">\n  Go\n</a>';

    const link = webFormsMarkup('A.aspx', text)?.elements.find((e) => e.kind === 'link');

    expect(link).toMatchObject({ text: 'Go', target: '/x.aspx', startLine: 1, endLine: 4 });
  });

  it('P5-31 a button without a handler has no target', () => {
    const text = '<asp:Button ID="b" Text="Reset" runat="server" />';

    const button = webFormsMarkup('A.aspx', text)?.elements.find((e) => e.kind === 'button');

    expect(button?.target).toBeUndefined();
  });
});

describe('the page of a WebForms file', () => {
  it('P5-31 a page directive of several lines is the page range', () => {
    const text = '<%@ Page Language="C#"\n  CodeBehind="A.aspx.cs" %>\n<html/>';

    expect(webFormsMarkup('A.aspx', text)?.page).toEqual({ startLine: 1, endLine: 2 });
  });

  it('P5-31 only a page file has its route in its path; controls and master pages do not', () => {
    expect(webFormsMarkup('A.aspx', '<html/>')?.route).toBe('file');
    expect(webFormsMarkup('A.ascx', '<html/>')?.route).toBe('elsewhere');
    expect(webFormsMarkup('A.master', '<html/>')?.route).toBe('elsewhere');
  });

  it('P5-31 text in a server comment is not an element', () => {
    const text = '<%-- <a href="/x">Hidden</a> --%>\n<html/>';

    expect(webFormsMarkup('A.aspx', text)?.elements).toEqual([]);
  });
});
