import { beforeAll, describe, expect, it } from 'vitest';
import type {
  PackAnalysis,
  PackSymbol,
} from '../../../../../src/application/ports/language-pack.js';
import { CSharpPack } from '../../../../../src/infrastructure/scan/packs/csharp/csharp-pack.js';

// Synthetic pages: invented names only.
let pack: CSharpPack;

beforeAll(async () => {
  pack = await CSharpPack.create();
});

function analyse(text: string, path = 'Page.aspx'): PackAnalysis {
  return pack.analyse({ path, text });
}

function shape(symbols: readonly PackSymbol[]): string[] {
  return symbols.map(
    (s) => `${s.kind}:${s.name}:${String(s.startLine)}-${String(s.endLine)}:${s.container ?? ''}`,
  );
}

const vbPage = `<%@ Page Language="VB" AutoEventWireup="false" CodeFile="Page.aspx.vb" Inherits="DemoPage" %>
<html>
<script runat="server">
    Sub Page_Load(sender As Object, e As EventArgs)
        Dim cmd = "INSERT INTO tblThing (Id) VALUES (1)"
    End Sub
</script>
<script type="text/javascript">
    function notServer() { return 1; }
</script>
<body></body>
</html>
`;

const csPage = `<%@ Page Language="C#" %>
<script runat="server">
    void Page_Load(object sender, EventArgs e)
    {
        var sql = "INSERT INTO tblThing (Id) VALUES (1)";
    }
    protected string Title { get; set; }
</script>
`;

describe('server script blocks of web forms pages', () => {
  it('RF-111 scans a script block with the VB page language and keeps the code-behind link', () => {
    const analysis = analyse(vbPage);

    expect(shape(analysis.symbols)).toEqual(['function:Page_Load:4-6:']);
    expect(analysis.references).toEqual([
      { from: 'Page.aspx', to: 'Page.aspx.vb', kind: 'code-behind', symbol: 'DemoPage' },
    ]);
  });

  it('RF-111 scans a script block with the C# page language at the right lines', () => {
    expect(shape(analyse(csPage).symbols)).toEqual([
      'function:Page_Load:3-6:',
      'property:Title:7-7:',
    ]);
  });

  it('RF-111 reads the language from a Control directive and from the code-behind extension', () => {
    const control = `<%@ Control Language="vb" %>\n<script runat="SERVER">\nFunction Total() As Integer\nReturn 1\nEnd Function\n</script>\n`;
    const byFile = `<%@ Page CodeBehind="P.aspx.vb" %>\n<script runat="server">\nSub A()\nEnd Sub\n</script>\n`;

    expect(shape(analyse(control, 'Row.ascx').symbols)).toEqual(['function:Total:3-5:']);
    expect(shape(analyse(byFile).symbols)).toEqual(['function:A:3-4:']);
  });
});

describe('server script blocks the pack leaves out', () => {
  it('RF-111 ignores a commented block, a block with src and a language it does not know', () => {
    const commented = `<%@ Page Language="C#" %>\n<%-- <script runat="server">void Gone() {}</script> --%>\n`;
    const external = `<%@ Page Language="C#" %>\n<script runat="server" src="x.cs"></script>\n`;
    const other = `<%@ Page Language="JScript" %>\n<script runat="server">function F() {}</script>\n`;

    expect(analyse(commented).symbols).toEqual([]);
    expect(analyse(external).symbols).toEqual([]);
    expect(analyse(other).symbols).toEqual([]);
  });

  it('RF-111 keeps the other blocks when one block has a syntax error', () => {
    const text = `<%@ Page Language="C#" %>\n<script runat="server">void Bad( {</script>\n<script runat="server">void Good() {}</script>\n`;

    expect(shape(analyse(text).symbols)).toEqual(['function:Good:3-3:']);
  });

  it('RF-111 gives a type declared in a C# script block no wrapper container', () => {
    const text = `<%@ Page Language="C#" %>
<script runat="server">
class Row
{
    public int Id { get; set; }
}
</script>
`;

    expect(shape(analyse(text).symbols)).toEqual(['class:Row:3-6:', 'property:Id:5-5:Row']);
  });

  it('RF-111 leaves out a block in an HTML comment', () => {
    const text = `<%@ Page Language="C#" %>
<!-- <script runat="server">void Gone() {}</script> -->
<script runat="server">void Kept() {}</script>
`;

    expect(shape(analyse(text).symbols)).toEqual(['function:Kept:3-3:']);
  });

  it('RF-111 finds a block after characters whose lower case is longer', () => {
    const text = `<%@ Page Language="C#" %>
<p>İİİİ</p>
<script runat="server">void Found() {}</script>
`;

    expect(shape(analyse(text).symbols)).toEqual(['function:Found:3-3:']);
  });
});
