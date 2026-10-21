// RF-152, RF-153, P3-94: text of a formula, as the plan reads it out of `formulas.md`. A formula is
// text and is never run: this only tells formulas that differ by their row from formulas that
// differ in fact, and writes the references to the row of a table as column names.

const LETTERS = 26;
const A = 'A'.charCodeAt(0);

/** A quoted text of a formula; `""` inside it is a quote. */
const LITERAL = /"(?:[^"]|"")*"/gu;

/** A table name before a bracket: `InvoiceTable[[#This Row],[Total]]`. */
const THIS_ROW = /(?:[A-Za-z_][\w.]*)?\[\[#This Row\],\s*(\[[^[\]]+\](?::\[[^[\]]+\])?)\]/gu;
const AT_BRACKETED = /(?:[A-Za-z_][\w.]*)?\[@\[([^[\]]+)\]\]/gu;
const AT_PLAIN = /(?:[A-Za-z_][\w.]*)?\[@([^[\]]+)\]/gu;

/** The pieces of a formula that are not quoted texts, with the quoted texts between them. */
function pieces(formula: string): { readonly text: string; readonly quoted: boolean }[] {
  const found: { text: string; quoted: boolean }[] = [];
  let at = 0;
  for (const match of formula.matchAll(LITERAL)) {
    found.push({ text: formula.slice(at, match.index), quoted: false });
    found.push({ text: match[0], quoted: true });
    at = match.index + match[0].length;
  }
  found.push({ text: formula.slice(at), quoted: false });
  return found;
}

/**
 * `InvoiceTable[[#This Row],[Net]]`, `T[@Net]` and `T[@[Net Amount]]` written as `[Net]`,
 * `[Net]` and `[Net Amount]`: the column of the row the formula sits on. A reference to a whole
 * column (`T[Net]`) keeps its table, and a quoted text is never changed.
 */
export function columnNamesOf(formula: string): string {
  return pieces(formula)
    .map(({ text, quoted }) =>
      quoted
        ? text
        : text.replace(THIS_ROW, '$1').replace(AT_BRACKETED, '[$1]').replace(AT_PLAIN, '[$1]'),
    )
    .join('');
}

/** The 0-based column of 1 to 3 letters. */
export function columnIndexOf(letters: string): number {
  let column = 0;
  for (const char of letters.toUpperCase())
    column = column * LETTERS + (char.charCodeAt(0) - A + 1);
  return column - 1;
}

const CELL = /^([A-Za-z]{1,3})([1-9][0-9]{0,6})$/u;

/** The 0-based column and the row of a cell address, or undefined when it is not one. */
export function cellOf(address: string): { column: number; row: number } | undefined {
  const match = CELL.exec(address);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return { column: columnIndexOf(match[1]), row: Number(match[2]) };
}

/** What can be left of a reference: a quoted text, a quoted sheet name, a bracket, or a cell. */
const TOKEN =
  /"(?:[^"]|"")*"|'(?:[^']|'')*'|\[[^\]]*\]|(?<![\w.$])(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d{0,6})(?![\w(])/gu;

/**
 * One reference with its row as the distance from the row the formula is in; a fixed row (`$1`) is
 * kept. The column stays as written: the cells of a region are all in one column, so a column that
 * differs between two formulas differs in the letters.
 */
function relativeCell(row: number, parts: readonly string[]): string {
  const [fixedColumn = '', letters = '', fixedRow, line = ''] = parts;
  const distance = fixedRow === '$' ? `$${line}` : `R[${String(Number(line) - row)}]`;
  return `${fixedColumn}${letters}${distance}`;
}

/**
 * The formula with each cell reference that moves with the row written as its distance from the
 * row the formula is in, so `R8*0.5` on row 8 and `R9*0.5` on row 9 give the same text. A fixed
 * row (`$1`) is kept, and so are quoted texts, sheet names, brackets and function names.
 */
export function relativeForm(formula: string, row: number): string {
  let out = '';
  let from = 0;
  for (const match of formula.matchAll(TOKEN)) {
    const [token, ...parts] = match;
    out += formula.slice(from, match.index);
    out += parts[1] === undefined ? token : relativeCell(row, parts);
    from = match.index + token.length;
  }
  return out + formula.slice(from);
}
