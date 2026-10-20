import { applyEdits, EditRecorder, fileNameOf } from './external-edit.js';
import { linkNamesByNumber } from './external-link-numbers.js';
import { extractReferences } from './formula-references.js';
import { MAX_FORMULA_CHARS } from './formula-scanner.js';
import type { ConditionalRule, DataValidationRule, WorkbookModel } from './workbook-model.js';

// RF-153, Q-38, RFC-005 section 4.4: a reference to another workbook is stored with a link number
// (`[1]Rates!C4`) or with the path of the file (`'C:\Users\x\[Rates.xlsx]Rates'!C4`, a UNC path, a URL).
// The folder often holds a user name and means nothing on the server, so every place that writes the
// text of a formula or a name shows the workbook part as the file name only (`[Rates.xlsx]Rates!C4`).
// Strings and structured table references are not references to a workbook and are left alone.
// A path written without quotes is hidden back to its start wherever it begins in its chunk. Two
// hand-made forms that no writer produces are not fully hidden: a bracket group longer than one chunk
// (32,768 characters) keeps the part before the chunk, and an unquoted path that straddles a chunk
// boundary keeps its whole folder (the chunk it ends in holds no path start). Every pass is linear
// in the length of the formula, which the file does not cap (RF-151).

/** Text that may hold an external reference: a bracket, or a quoted path such as `'C:\dir\Book.xlsx'!Name`. */
const MAY_HOLD_EXTERNAL = /['[]/u;

/** Where an unquoted path starts: a URL scheme, a drive or a UNC share. */
const PATH_START = /[A-Za-z]{2,10}:\/\/|[A-Za-z]:[\\/]|\\\\/u;
/** A character that ends the run of an unquoted path when read backwards from its bracket. */
const PATH_STOP = /[\s'"[\]]/u;

/**
 * Where the text to hide before the bracket at `open` starts, or `open` when nothing is hidden: the
 * character after the last quote of the piece (a quoted name is a path up to its bracket), or the
 * earliest path start in the run of path characters before the bracket. One walk back from the
 * bracket to `from`, so the brackets of one piece never read the same character twice.
 */
function hiddenFrom(text: string, from: number, open: number): number {
  let run = open;
  for (let at = open; at > from; at -= 1) {
    const char = text.charAt(at - 1);
    if (char === ']') break;
    if (char === "'") return at;
    if (run === at && !PATH_STOP.test(char)) run = at - 1;
  }
  const found = PATH_START.exec(text.slice(run, open));
  return found === null ? open : run + found.index;
}

/**
 * Last resort for text no token covers: hide the folder of anything that looks like a workbook path.
 * One pass: each bracket group is found once and the text before it is read back once, so the work
 * grows with the length of the text (a formula has no length cap in the file, RF-151).
 */
function looseHide(text: string): string {
  let out = '';
  let from = 0;
  let close = -1;
  for (let open = text.indexOf('['); open >= 0; open = text.indexOf('[', from)) {
    // The close is searched once per run of nested brackets, not again from every inner one.
    if (close < open) close = text.indexOf(']', open + 1);
    if (close < 0) break;
    const inner = text.indexOf('[', open + 1);
    if (inner >= 0 && inner < close) {
      out += text.slice(from, inner);
      from = inner;
      continue;
    }
    const content = text.slice(open + 1, close);
    const at = hiddenFrom(text, from, open);
    const path = at < open || /[\\/]/u.test(content);
    out += text.slice(from, at) + (path ? `[${fileNameOf(content)}]` : text.slice(at, close + 1));
    from = close + 1;
  }
  return out + text.slice(from);
}

/** How many characters from `from`, which holds `quote`, belong to the literal or name it opens. */
function quotedLength(formula: string, from: number, quote: string): number {
  let at = from + 1;
  for (;;) {
    const close = formula.indexOf(quote, at);
    if (close < 0) return formula.length - from;
    if (formula.charAt(close + 1) !== quote) return close + 1 - from;
    at = close + 2;
  }
}

/** A literal or name longer than a chunk, read to its end so the next chunk does not start inside it. */
function longQuoted(
  formula: string,
  offset: number,
  quote: string,
): { text: string; used: number } {
  const used = quotedLength(formula, offset, quote);
  const span = formula.slice(offset, offset + used);
  // A quoted name is hidden with the loose pass; a string literal is kept as it is.
  return { text: quote === "'" ? looseHide(span) : span, used };
}

/** The rewritten text of the chunk at `offset` and how much of the formula it covered. */
function rewriteChunk(
  formula: string,
  offset: number,
  links: readonly string[],
): { text: string; used: number } {
  const chunk = formula.slice(offset, offset + MAX_FORMULA_CHARS);
  const more = offset + chunk.length < formula.length;
  const recorder = new EditRecorder(chunk, links);
  const read = extractReferences(chunk, { recorder });
  // The tokenizer stops at its reference limit; a chunk that ends the text mid-token is read again
  // from that token. A token longer than a chunk is hidden with the loose pass.
  const used = read.stoppedAt ?? (more ? read.lastStep : chunk.length);
  if (used > 0) return { text: applyEdits(chunk, recorder.edits, used), used };
  const quote = chunk.charAt(0);
  if (quote === '"' || quote === "'") return longQuoted(formula, offset, quote);
  return { text: looseHide(applyEdits(chunk, recorder.edits, chunk.length)), used: chunk.length };
}

/** The formula with the workbook part of each external reference shown as the file name only. */
export function showExternalNames(formula: string, links: readonly string[]): string {
  if (!MAY_HOLD_EXTERNAL.test(formula)) return formula;
  let out = '';
  let offset = 0;
  while (offset < formula.length) {
    const { text, used } = rewriteChunk(formula, offset, links);
    out += text;
    offset += used;
  }
  return out;
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
 * external workbook. Only what may hold one is copied; the rest is shared with the original.
 */
export function plainModel(model: WorkbookModel): WorkbookModel {
  const links = linkNamesByNumber(model.externalLinks);
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
        if (formula === undefined || !MAY_HOLD_EXTERNAL.test(formula.text)) return cell;
        return { ...cell, formula: { ...formula, text: showExternalNames(formula.text, links) } };
      }),
      validations: sheet.validations.map((rule) => plainRule(rule, links)),
      conditionalRules: sheet.conditionalRules.map((rule) => plainRule(rule, links)),
    })),
  };
}
