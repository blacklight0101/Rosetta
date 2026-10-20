// RF-151: A1 addresses, as the reader needs them to give a cell that omits `r` the address its
// position says. A sheet has at most 16,384 columns (A..XFD) and 1,048,576 rows, so an address
// beyond them is refused by the caller; nothing here loops on its input.

const LETTERS = 26;
const A = 'A'.charCodeAt(0);
export const MAX_COLUMNS = 16_384;
export const MAX_ROWS = 1_048_576;
const ADDRESS = /^([A-Za-z]{1,3})([1-9][0-9]{0,6})$/;
const ROW_NUMBER = /^[1-9][0-9]{0,6}$/;

/** The 0-based column and the row of `A1`-style text, or `undefined` when it is not inside the sheet. */
export function parseAddress(address: string): { column: number; row: number } | undefined {
  const match = ADDRESS.exec(address);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  let column = 0;
  for (const char of match[1].toUpperCase())
    column = column * LETTERS + (char.charCodeAt(0) - A + 1);
  const row = Number(match[2]);
  return column > MAX_COLUMNS || row > MAX_ROWS ? undefined : { column: column - 1, row };
}

/** A row number from the file, or `undefined` when it is not a whole number of at most seven digits. */
export function parseRowNumber(text: string): number | undefined {
  return ROW_NUMBER.test(text) ? Number(text) : undefined;
}

/** The letters of a 0-based column (0 is `A`, 26 is `AA`); a column outside the sheet is a RangeError. */
export function columnName(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_COLUMNS) {
    throw new RangeError('The column is outside the sheet.');
  }
  let name = '';
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / LETTERS)) {
    name = String.fromCharCode(A + ((rest - 1) % LETTERS)) + name;
  }
  return name;
}
