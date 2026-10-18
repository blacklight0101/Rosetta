// The layout block of docs/architecture.md section 4 is a text fence that starts with `src/`. A layer is a
// line `  <layer>/` inside it; a row is a line at exactly four spaces under its layer (`    <name>/` followed by
// its description). Continuation lines are indented further, and prose outside the fence is not a row.

const HEADING = '## 4. Repository and solution layout';
const LAYER = /^ {2}([a-z]+)\/\s*$/;
const ROW = /^ {4}([a-z][a-z-]*)\/ {2,}\S/;

/** The src/ fence of section 4: its lines, from `src/` to the first top-level line after it. */
function srcFence(text: string): string[] {
  const start = text.indexOf(HEADING);
  if (start < 0) throw new Error('Section 4 of docs/architecture.md is not found');
  const open = text.indexOf('```text\n', start);
  const close = text.indexOf('\n```', open + 1);
  if (open < 0 || close < 0) throw new Error('Section 4 has no text fence');
  const lines = text.slice(open + '```text\n'.length, close).split('\n');
  const first = lines.indexOf('src/');
  if (first < 0) throw new Error('The section 4 fence has no src/ block');
  const block: string[] = [];
  for (const line of lines.slice(first + 1)) {
    if (line.length > 0 && !line.startsWith(' ')) break;
    block.push(line);
  }
  return block;
}

/** Layer name -> the folder names of its rows in section 4, in document order. */
export function layoutRows(text: string): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  let layer: string | undefined;
  for (const line of srcFence(text)) {
    const heading = LAYER.exec(line);
    if (heading?.[1] !== undefined) {
      layer = heading[1];
      rows.set(layer, []);
      continue;
    }
    const row = ROW.exec(line);
    if (row?.[1] !== undefined && layer !== undefined) rows.get(layer)?.push(row[1]);
  }
  return rows;
}

/**
 * What section 4 gets wrong against the folders on disk: a layer of src/ with no heading, a heading that is
 * not a folder of src/, and a folder with no row under its own layer (a row of another layer does not count).
 */
export function layoutProblems(
  text: string,
  actual: ReadonlyMap<string, readonly string[]>,
): string[] {
  const rows = layoutRows(text);
  const problems: string[] = [];
  for (const layer of actual.keys())
    if (!rows.has(layer)) problems.push(`${layer}/ has no heading`);
  for (const layer of rows.keys())
    if (!actual.has(layer)) problems.push(`${layer}/ is not a folder of src/`);
  for (const [layer, folders] of actual) {
    const documented = rows.get(layer) ?? [];
    for (const folder of folders)
      if (!documented.includes(folder)) problems.push(`${layer}/${folder} has no row`);
  }
  return problems;
}
