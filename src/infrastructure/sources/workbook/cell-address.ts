// RF-151: A1 addresses, as the reader needs them to give a cell that omits `r` the address its
// position says.

const LETTERS = 26;
const A = 'A'.charCodeAt(0);

/** The 0-based column of `address` (`B7` is 1), or 0 for text that is not an address. */
export function columnIndexOf(address: string): number {
  let index = 0;
  for (const char of address) {
    const code = char.toUpperCase().charCodeAt(0);
    if (code < A || code >= A + LETTERS) break;
    index = index * LETTERS + (code - A + 1);
  }
  return Math.max(index - 1, 0);
}

/** The letters of a 0-based column (0 is `A`, 26 is `AA`). */
export function columnName(index: number): string {
  let rest = index + 1;
  let name = '';
  while (rest > 0) {
    const digit = (rest - 1) % LETTERS;
    name = String.fromCharCode(A + digit) + name;
    rest = Math.floor((rest - 1) / LETTERS);
  }
  return name;
}
