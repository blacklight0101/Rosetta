import { applyEdits, EditRecorder, fileNameOf } from './external-edit.js';
import { extractReferences } from './formula-references.js';
import { MAX_FORMULA_CHARS } from './formula-scanner.js';
import type { ConditionalRule, DataValidationRule, WorkbookModel } from './workbook-model.js';

// RF-153, Q-38, RFC-005 section 4.4: a reference to another workbook is stored with a link number
// (`[1]Rates!C4`) or with the path of the file (`'C:\Users\x\[Rates.xlsx]Rates'!C4`, a UNC path, a URL).
// The folder often holds a user name and means nothing on the server, so every place that writes the
// text of a formula or a name shows the workbook part as the file name only (`[Rates.xlsx]Rates!C4`).
// Strings and structured table references are not references to a workbook and are left alone.

/** Brackets that hold a path, and the quoted or unquoted path before them, for text the tokenizer skipped. */
const LOOSE =
  /(?:'[^'[\]]*|[A-Za-z]{2,10}:\/\/[^\s'"[\]]*|[A-Za-z]:[\\/][^\s'"[\]]*|\\\\[^\s'"[\]]*)?\[([^[\]]*)\]/gu;

/** Last resort for text no token covers: hide the folder of anything that looks like a workbook path. */
function looseHide(text: string): string {
  return text.replace(LOOSE, (found: string, content: string) => {
    const quoted = found.startsWith("'");
    const path = found.length > content.length + 2 || /[\\/]/u.test(content);
    if (!path) return found;
    return `${quoted ? "'" : ''}[${fileNameOf(content)}]`;
  });
}

/** The formula with the workbook part of each external reference shown as the file name only. */
export function showExternalNames(formula: string, links: readonly string[]): string {
  if (!formula.includes('[')) return formula;
  let out = '';
  let offset = 0;
  while (offset < formula.length) {
    const chunk = formula.slice(offset, offset + MAX_FORMULA_CHARS);
    const more = offset + chunk.length < formula.length;
    const recorder = new EditRecorder(chunk, links);
    const read = extractReferences(chunk, { recorder });
    // The tokenizer stops at its reference limit; a chunk that ends the text mid-token is read again
    // from that token. A token longer than a chunk is hidden with the loose pass.
    let used = read.stoppedAt ?? (more ? read.lastStep : chunk.length);
    const stuck = used <= 0;
    if (stuck) used = chunk.length;
    const text = applyEdits(chunk, recorder.edits, used);
    out += stuck ? looseHide(text) : text;
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
