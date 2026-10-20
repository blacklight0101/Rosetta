import { isWordChar } from './formula-scanner.js';

// RF-153, Q-38, RFC-005 section 4.4: a formula that reads another workbook is stored with a link
// number (`[1]Rates!C4`). The rendered text shows the file name instead (`[Rates.xlsx]Rates!C4`),
// without the folder: the folder often holds a user name and means nothing on the server.

const LINK = /^\[([0-9]{1,6})\]/u;

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? path;
}

/** The text that replaces `[n]` at the start of `text`, and its length, or undefined. */
function replacement(
  text: string,
  links: readonly string[],
): { text: string; length: number } | undefined {
  const match = LINK.exec(text);
  const number = Number(match?.[1]);
  const link = match === null ? undefined : links[number - 1];
  if (match === null || link === undefined || number < 1) return undefined;
  const after = text.charAt(match[0].length);
  if (!(isWordChar(after) || after === "'" || after === '!')) return undefined;
  return { text: `[${fileNameOf(link)}]`, length: match[0].length };
}

/** The end of the string literal or the quoted name that starts at `start`. */
function endOfQuoted(formula: string, start: number): number {
  const quote = formula.charAt(start);
  let at = start + 1;
  while (at < formula.length) {
    const close = formula.indexOf(quote, at);
    if (close < 0) return formula.length;
    if (formula.charAt(close + 1) !== quote) return close + 1;
    at = close + 2;
  }
  return formula.length;
}

/** A link number at `at`, or right after an opening quote there; `skip` is the quote's length. */
function linkAt(
  formula: string,
  at: number,
  links: readonly string[],
): { text: string; length: number; skip: number } | undefined {
  const char = formula.charAt(at);
  const before = formula.charAt(at - 1);
  const skip = char === "'" ? 1 : 0;
  const starts =
    skip === 1 || (char === '[' && !isWordChar(before) && before !== ']' && before !== "'");
  const found = starts ? replacement(formula.slice(at + skip, at + skip + 9), links) : undefined;
  return found === undefined ? undefined : { ...found, skip };
}

/** The formula with each link number replaced by the file name of its target (strings are kept). */
export function showExternalNames(formula: string, links: readonly string[]): string {
  if (links.length === 0 || !formula.includes('[')) return formula;
  const parts: string[] = [];
  let at = 0;
  while (at < formula.length) {
    const char = formula.charAt(at);
    if (char === '"') {
      const end = endOfQuoted(formula, at);
      parts.push(formula.slice(at, end));
      at = end;
      continue;
    }
    const found = linkAt(formula, at, links);
    if (found === undefined) {
      parts.push(char);
      at += 1;
    } else {
      parts.push(formula.slice(at, at + found.skip), found.text);
      at += found.skip + found.length;
    }
  }
  return parts.join('');
}
