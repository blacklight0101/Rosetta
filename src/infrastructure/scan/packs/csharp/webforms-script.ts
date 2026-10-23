// RF-111: the `<script runat="server">` blocks of a web forms page. The page is untrusted text: the
// scan uses indexOf on a lower-case copy, no regular expression over the input, and caps the
// number of blocks. A block inside a server comment (`<%-- --%>`) or with a `src` attribute is not
// code of this page.

const maxBlocks = 50;
const maxTagCharacters = 2000;

export interface ScriptBlock {
  readonly text: string;
  /** 1-based line of the first character of `text`. */
  readonly startLine: number;
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let at = text.indexOf('\n'); at >= 0 && at < offset; at = text.indexOf('\n', at + 1)) {
    line += 1;
  }
  return line;
}

/** Offsets `[from, to)` of the server comments. */
function commentRanges(lower: string): [number, number][] {
  const ranges: [number, number][] = [];
  let from = lower.indexOf('<%--');
  while (from >= 0 && ranges.length < maxBlocks * 4) {
    const close = lower.indexOf('--%>', from + 4);
    const to = close < 0 ? lower.length : close + 4;
    ranges.push([from, to]);
    from = lower.indexOf('<%--', to);
  }
  return ranges;
}

/** Attribute text of a tag holds `runat="server"` (either quote, any case, spaces allowed). */
function runsAtServer(tag: string): boolean {
  const compact = tag.replaceAll(' ', '').replaceAll("'", '"');
  return compact.includes('runat="server"');
}

/** The server script blocks of a page, in file order. */
export function serverScriptBlocks(text: string): ScriptBlock[] {
  const lower = text.toLowerCase();
  const comments = commentRanges(lower);
  const blocks: ScriptBlock[] = [];
  let from = lower.indexOf('<script');
  while (from >= 0 && blocks.length < maxBlocks) {
    const tagEnd = lower.indexOf('>', from);
    if (tagEnd < 0) break;
    const closeAt = lower.indexOf('</script', tagEnd);
    const end = closeAt < 0 ? lower.length : closeAt;
    const tag = lower.slice(from, Math.min(tagEnd, from + maxTagCharacters));
    const commented = comments.some(([start, stop]) => from >= start && from < stop);
    if (!commented && runsAtServer(tag) && !tag.includes(' src=') && !tag.endsWith('/')) {
      blocks.push({ text: text.slice(tagEnd + 1, end), startLine: lineAt(text, tagEnd + 1) });
    }
    from = lower.indexOf('<script', end);
  }
  return blocks;
}
