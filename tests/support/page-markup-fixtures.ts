import type { CardDraft } from '../../src/domain/cards/card-ids.js';
import type { ScreenInput } from '../../src/domain/cards/flow-screen.js';
import type { PageMarkup } from '../../src/domain/cards/page-markup.js';
import { draftOf } from './card-fixtures.js';

// P5-31, RF-626, DEC-03: a synthetic WebForms contact page (no code of any employer) with a link, a
// button with a handler, a calendar with no validator and a text field with a required attribute,
// and the markup index of it as a language pack returns it.

export const contactPath = 'Web/Contact.aspx';

/** The lines of the page; the line numbers of the tests count from 1. */
export const contactLines = [
  '<%@ Page Language="C#" CodeBehind="Contact.aspx.cs" Inherits="Demo.Contact" %>',
  '<html>',
  '<body>',
  '<form id="form1" runat="server">',
  '  <a href="mailto:help@example.test">Email support</a>',
  '  <asp:Label AssociatedControlID="txtCity" Text="City" runat="server" />',
  '  <asp:TextBox ID="txtCity" runat="server" required="required" />',
  '  <asp:Calendar ID="calVisit" runat="server" />',
  '  <asp:Button ID="btnSave" Text="Save" OnClick="btnSave_Click" runat="server" />',
  '</form>',
  '</body>',
  '</html>',
];

export const contactText = `${contactLines.join('\n')}\n`;

export const contactMarkup: PageMarkup = {
  path: contactPath,
  route: 'file',
  page: { startLine: 1, endLine: 1 },
  elements: [
    {
      kind: 'link',
      names: [],
      text: 'Email support',
      target: 'mailto:help@example.test',
      startLine: 5,
      endLine: 5,
    },
    {
      kind: 'field',
      names: ['txtCity'],
      text: '',
      required: true,
      startLine: 7,
      endLine: 7,
      label: { names: ['City'], startLine: 6, endLine: 6 },
    },
    { kind: 'field', names: ['calVisit'], text: '', required: false, startLine: 8, endLine: 8 },
    {
      kind: 'button',
      names: ['btnSave'],
      text: 'Save',
      target: 'btnSave_Click',
      startLine: 9,
      endLine: 9,
    },
  ],
};

const written = [
  {
    text: 'The contact page is served.',
    citations: [
      { path: contactPath, startLine: 1, endLine: 3 },
      { path: contactPath, startLine: 5, endLine: 12 },
    ],
  },
];

/** What the agent wrote for the page: it says the calendar is required and the link a handler. */
export const contactScreen: ScreenInput = {
  route: '/Web/Contact.aspx',
  roles: [],
  fields: [
    { name: 'City', inputKind: 'text', required: true, validations: [] },
    { name: 'Visit', inputKind: 'calendar', required: true, validations: [] },
  ],
  actions: [
    { label: 'Email support', handler: 'mailto:help@example.test' },
    { label: 'Save', handler: 'btnSave_Click' },
  ],
  leadsTo: [],
  markup: [contactMarkup],
};

export function contactDraft(screen: ScreenInput = contactScreen): CardDraft {
  return draftOf({ type: 'SCRN', title: 'Contact page', area: 'Web', claims: written, screen });
}
