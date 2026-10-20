import { canonicalRange, positionOf } from './cell-order.js';
import { TextFile, type ByteBudget } from './render-output.js';
import type {
  ConditionalRule,
  DataValidationRule,
  SheetComment,
  WorkbookSheet,
} from './workbook-model.js';
import { escapeInline, NAME_CAP, quoteText } from './workbook-text.js';

// RF-152, Q-39, RFC-005 section 4.4: `validation.md` (data validation and conditional formatting
// rules, each line starting with the range it applies to) and `notes.md` (comments with their cell
// address; the model holds no author, so none can be written). Every text from the file is escaped
// to one line and cut, so a rule or a comment cannot add a line that claims other cells.

const RANGES_CAP = 200;
const WORD_CAP = 40;
const FORMULA_CAP = 300;
const FORMULAS_LISTED = 5;
const COMMENT_CAP = 1500;
const RANGE_TOKEN = /^[A-Za-z]{1,3}[1-9][0-9]{0,6}(?::[A-Za-z]{1,3}[1-9][0-9]{0,6})?$/u;
const MAX_RANGE_TOKENS = 50;

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

function validationLine(rule: DataValidationRule): string {
  const operator = rule.operator === undefined ? '' : ` ${word(rule.operator)}`;
  const first = rule.formula1 === undefined ? '' : escapeInline(rule.formula1, FORMULA_CAP);
  const second =
    rule.formula2 === undefined ? '' : ` and ${escapeInline(rule.formula2, FORMULA_CAP)}`;
  const rest = first === '' ? '' : `: ${first}${second}`;
  return `${rangesText(rule.ranges)} validation ${word(rule.type)}${operator}${rest}`;
}

function conditionalLine(rule: ConditionalRule): string {
  const operator = rule.operator === undefined ? '' : ` ${word(rule.operator)}`;
  const shown = rule.formulas.slice(0, FORMULAS_LISTED).map((f) => escapeInline(f, FORMULA_CAP));
  const more = rule.formulas.length - shown.length;
  if (more > 0) shown.push(`(+${String(more)} more)`);
  const rest = shown.length === 0 ? '' : `: ${shown.join(' ; ')}`;
  return `${rangesText(rule.ranges)} conditional ${word(rule.type)}${operator}${rest}`;
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
  addRules(file, '## Data validation', sheet.validations.map(validationLine));
  addRules(file, '## Conditional formatting', sheet.conditionalRules.map(conditionalLine));
  return file.text();
}

function commentLine(comment: SheetComment): string {
  const address = canonicalRange(comment.address) ?? quoteText(comment.address, WORD_CAP);
  return `${address} ${quoteText(comment.text, COMMENT_CAP)}`;
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
  for (const comment of ordered(sheet.comments)) file.add(commentLine(comment));
  return file.text();
}
