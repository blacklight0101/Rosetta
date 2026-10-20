import { isWordChar } from './formula-scanner.js';
import type { ConditionalRule, DataValidationRule, WorkbookModel } from './workbook-model.js';

// RF-153, Q-38, RFC-005 section 4.4: a reference to another workbook is stored with a link number
// (`[1]Rates!C4`) or with the path of the file (`'C:\Users\x\[Rates.xlsx]Rates'!C4`, a UNC path, a URL).
// The folder often holds a user name and means nothing on the server, so every place that writes the
// text of a formula or a name shows the workbook part as the file name only (`[Rates.xlsx]Rates!C4`).
// Strings and structured table references are not references to a workbook and are left alone.

interface Piece {
  readonly text: string;
  readonly length: number;
}

const BRACKET = /^\[([^[\]]{1,300})\]/u;
const DIGITS = /^[0-9]{1,6}$/u;
const SEPARATOR = /[\\/]/u;

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? path;
}

/** The file name a bracket holds: a link number through `links`, or a path cut to its last part. */
function bookName(content: string, links: readonly string[]): string | undefined {
  if (DIGITS.test(content)) {
    const number = Number(content);
    const link = number < 1 ? undefined : links[number - 1];
    return link === undefined ? undefined : fileNameOf(link);
  }
  return SEPARATOR.test(content) ? fileNameOf(content) : undefined;
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

/** `'C:\dir\[1]Sheet'` as `'[Rates.xlsx]Sheet'`: the folder before the bracket goes, the bracket is named. */
function plainQuoted(quoted: string, links: readonly string[]): string {
  if (quoted.length < 2 || !quoted.endsWith("'")) return quoted;
  const inner = quoted.slice(1, -1);
  const open = inner.indexOf('[');
  const close = open < 0 ? -1 : inner.indexOf(']', open);
  if (close < open) return quoted;
  const name = bookName(inner.slice(open + 1, close), links) ?? inner.slice(open + 1, close);
  return `'[${name}]${inner.slice(close + 1)}'`;
}

function followsBook(char: string): boolean {
  return isWordChar(char) || char === "'" || char === '!';
}

/** A bracket outside quotes that names a workbook (`[1]Sheet!A1`), with the text that replaces it. */
function plainBracket(formula: string, at: number, links: readonly string[]): Piece | undefined {
  const before = formula.charAt(at - 1);
  if (isWordChar(before) || before === ']' || before === "'") return undefined;
  const match = BRACKET.exec(formula.slice(at, at + 310));
  if (match === null) return undefined;
  const name = bookName(match[1] ?? '', links);
  if (name === undefined || !followsBook(formula.charAt(at + match[0].length))) return undefined;
  return { text: `[${name}]`, length: match[0].length };
}

/** The piece of the formula that starts at `at` (a string, a quoted name, a bracket or one character). */
function nextPiece(formula: string, at: number, links: readonly string[]): Piece {
  const char = formula.charAt(at);
  if (char === '"' || char === "'") {
    const end = endOfQuoted(formula, at);
    const piece = formula.slice(at, end);
    return { text: char === "'" ? plainQuoted(piece, links) : piece, length: end - at };
  }
  return (char === '[' ? plainBracket(formula, at, links) : undefined) ?? { text: char, length: 1 };
}

/** The formula with the workbook part of each external reference shown as the file name only. */
export function showExternalNames(formula: string, links: readonly string[]): string {
  if (!formula.includes('[')) return formula;
  const parts: string[] = [];
  let at = 0;
  while (at < formula.length) {
    const next = nextPiece(formula, at, links);
    parts.push(next.text);
    at += next.length;
  }
  return parts.join('');
}

function plainRule<T extends DataValidationRule | ConditionalRule>(
  rule: T,
  links: readonly string[],
): T {
  if ('formulas' in rule) {
    return { ...rule, formulas: rule.formulas.map((f) => showExternalNames(f, links)) };
  }
  const { formula1, formula2 } = rule;
  return {
    ...rule,
    ...(formula1 === undefined ? {} : { formula1: showExternalNames(formula1, links) }),
    ...(formula2 === undefined ? {} : { formula2: showExternalNames(formula2, links) }),
  };
}

/**
 * The model with the text of every formula, rule and defined name written without the folder of an
 * external workbook. Only what holds a bracket is copied; the rest is shared with the original.
 */
export function plainModel(model: WorkbookModel): WorkbookModel {
  const links = model.externalLinks.map((link) => link.fileName);
  return {
    ...model,
    definedNames: model.definedNames.map((name) => ({
      ...name,
      refersTo: showExternalNames(name.refersTo, links),
    })),
    sheets: model.sheets.map((sheet) => ({
      ...sheet,
      cells: sheet.cells.map((cell) => {
        const formula = cell.formula;
        if (!formula?.text.includes('[')) return cell;
        return { ...cell, formula: { ...formula, text: showExternalNames(formula.text, links) } };
      }),
      validations: sheet.validations.map((rule) => plainRule(rule, links)),
      conditionalRules: sheet.conditionalRules.map((rule) => plainRule(rule, links)),
    })),
  };
}
