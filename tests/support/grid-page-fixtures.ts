import type { CardDraft } from '../../src/domain/cards/card-ids.js';
import type { Citation } from '../../src/domain/cards/citation.js';
import type { ScreenInput } from '../../src/domain/cards/flow-screen.js';
import type { PageMarkup } from '../../src/domain/cards/page-markup.js';
import { draftOf } from './card-fixtures.js';

// P5-44, RF-626, DEC-03: a synthetic WebForms history page modelled on the public Hospital
// Management ASP.NET sample (MIT): a grid whose template holds a link the markup reader cannot
// match to a target, a redirect in code-behind, and a button the agent named a handler for.

export const gridPath = 'Doctor/History.aspx';
export const gridCodePath = 'Doctor/History.aspx.cs';

const gridLines = [
  '<%@ Page Language="C#" CodeBehind="History.aspx.cs" Inherits="Demo.History" %>',
  '<html>',
  '<body>',
  '<form id="form1" runat="server">',
  '  <asp:GridView ID="grid" runat="server" AutoGenerateColumns="false">',
  '    <Columns>',
  '      <asp:TemplateField>',
  '        <ItemTemplate>',
  '          <asp:HyperLink NavigateUrl=\'<%# "Bill.aspx?id=" + Eval("Id") %>\' Text="Bill" runat="server" />',
  '        </ItemTemplate>',
  '      </asp:TemplateField>',
  '    </Columns>',
  '  </asp:GridView>',
  '  <asp:Button ID="btnPrint" Text="Print" OnClick="btnPrint_Click" runat="server" />',
  '</form>',
  '</body>',
  '</html>',
];

export const gridText = `${gridLines.join('\n')}\n`;

/** What the pack returns for the page: the template link has a computed target. */
export const gridMarkup: PageMarkup = {
  path: gridPath,
  route: 'file',
  page: { startLine: 1, endLine: 1 },
  elements: [
    {
      kind: 'link',
      names: [],
      text: 'Bill',
      target: '<%# "Bill.aspx?id=" + Eval("Id") %>',
      startLine: 9,
      endLine: 9,
    },
    {
      kind: 'button',
      names: ['btnPrint'],
      text: 'Print',
      target: 'btnPrint_Click',
      startLine: 14,
      endLine: 14,
    },
  ],
};

const at = (path: string, startLine: number, endLine = startLine): Citation => ({
  path,
  startLine,
  endLine,
});

const written = [
  { text: 'The history page lists the visits.', citations: [at(gridPath, 1, 17)] },
  {
    text: 'Each row of the grid has a Bill link to Bill.aspx.',
    citations: [at(gridPath, 8, 10)],
  },
  {
    text: 'Choosing a row redirects to HistoryUpdate.aspx.',
    citations: [at(gridCodePath, 14)],
  },
  { text: 'Export_Click writes the report file.', citations: [at(gridCodePath, 30, 34)] },
];

export const gridScreen: ScreenInput = {
  route: '/Doctor/History.aspx',
  roles: [],
  fields: [],
  actions: [
    { label: 'Print', handler: 'btnPrint_Click' },
    { label: 'Export', handler: 'Export_Click' },
    { label: 'Archive', handler: 'Archive_Click' },
  ],
  leadsTo: ['Bill.aspx', 'HistoryUpdate.aspx', 'Missing.aspx'],
  markup: [gridMarkup],
};

export function gridDraft(screen: ScreenInput = gridScreen): CardDraft {
  return draftOf({ type: 'SCRN', title: 'History page', area: 'Doctor', claims: written, screen });
}

export const gridCite = at;
