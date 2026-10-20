import { canonicalRange, positionOf } from './cell-order.js';
import { TextFile, type ByteBudget } from './render-output.js';
import type {
  ConditionalRule,
  DataValidationRule,
  SheetComment,
  WorkbookSheet,
} from './workbook-model.js';
import { escapeInline, NAME_CAP, quoteText, splitText } from './workbook-text.js';

// RF-152, Q-39, RFC-005 section 4.4: `validation.md` (data validation and conditional formatting
// rules, each line starting with the range it applies to) and `notes.md` (comments with their cell
// address; the model holds no author, so none can be written). Every text from the file is escaped
// to one line and cut, so a rule or a comment cannot add a line that claims other cells.

const RANGES_CAP = 200;
const WORD_CAP = 40;
const RULE_CHUNK = 800;
const COMMENT_CHUNK = 1000;
const RANGE_TOKEN = /^[A-Za-z]{1,3}[1-9][0-9]{0,6}(?::[A-Za-z]{1,3}[1-9][0-9]{0,6})?$/u;
const MAX_RANGE_TOKENS = 40;

/** The ranges of a rule written as references; anything else is quoted so it cannot pass for cells. */
function rangesText(ranges: string): string {
  const tokens = ranges.trim().split(/\s+/u);
  const canonical = tokens.map((token) =>
    RANGE_TOKEN.test(token) ? canonicalRange(token) : undefined,
  );
  if (tokens.length > MAX_RANGE_TOKENS || canonical.some((token) => token === undefined)) {
    return quoteText(ranges, RANGES_CAP);
  }
  return canonical.join(' ');
}

function word(text: string): string {
  return escapeInline(text, WORD_CAP);
}

/** A rule on as many lines as its formulas need; each starts with the same ranges. */
function ruleLines(head: string, ranges: string, kind: string, body: string): string[] {
  const [first, ...rest] = body === '' ? [] : splitText(body, RULE_CHUNK, false);
  if (first === undefined) return [head];
  return [`${head}: ${first}`, ...rest.map((piece) => `${ranges} ${kind} (continued): ${piece}`)];
}

function validationLines(rule: DataValidationRule): string[] {
  const ranges = rangesText(rule.ranges);
  const operator = rule.operator === undefined ? '' : ` ${word(rule.operator)}`;
  const second = rule.formula2 === undefined ? '' : ` and ${rule.formula2}`;
  const body = rule.formula1 === undefined ? '' : `${rule.formula1}${second}`;
  const head = `${ranges} validation ${word(rule.type)}${operator}`;
  return ruleLines(head, ranges, 'validation', body);
}

function conditionalLines(rule: ConditionalRule): string[] {
  const ranges = rangesText(rule.ranges);
  const operator = rule.operator === undefined ? '' : ` ${word(rule.operator)}`;
  const head = `${ranges} conditional ${word(rule.type)}${operator}`;
  return ruleLines(head, ranges, 'conditional', rule.formulas.join(' ; '));
}

function addRules(file: TextFile, heading: string, lines: readonly string[]): void {
  file.section(heading);
  if (lines.length === 0) file.add('None.');
  for (const line of lines) file.add(line);
}

export function renderValidation(sheet: WorkbookSheet, budget: ByteBudget): string {
  const file = new TextFile(budget);
  file.add(`# Validation of sheet ${quoteText(sheet.name, NAME_CAP)}`);
  file.add(`- Data validation rules: ${String(sheet.validations.length)}`);
  file.add(`- Conditional formatting rules: ${String(sheet.conditionalRules.length)}`);
  addRules(file, '## Data validation', sheet.validations.flatMap(validationLines));
  addRules(file, '## Conditional formatting', sheet.conditionalRules.flatMap(conditionalLines));
  return file.text();
}

function commentLines(comment: SheetComment): string[] {
  const address = canonicalRange(comment.address) ?? quoteText(comment.address, WORD_CAP);
  const [first, ...rest] = splitText(comment.text, COMMENT_CHUNK, true);
  return [
    `${address} "${first ?? ''}"`,
    ...rest.map((piece) => `${address} (continued) "${piece}"`),
  ];
}

/** The comments in reading order; one with an address that is not a cell goes last. */
function ordered(comments: readonly SheetComment[]): SheetComment[] {
  const key = (comment: SheetComment): number => {
    const position = positionOf(comment.address);
    return position === undefined
      ? Number.MAX_SAFE_INTEGER
      : position.row * 20_000 + position.column;
  };
  return [...comments].sort((a, b) => key(a) - key(b));
}

export function renderNotes(sheet: WorkbookSheet, budget: ByteBudget): string {
  const file = new TextFile(budget);
  file.add(`# Notes of sheet ${quoteText(sheet.name, NAME_CAP)}`);
  file.add(`- Comments: ${String(sheet.comments.length)}`);
  file.add();
  if (sheet.comments.length === 0) file.add('No comments.');
  for (const comment of ordered(sheet.comments)) {
    for (const line of commentLines(comment)) file.add(line);
  }
  return file.text();
}
